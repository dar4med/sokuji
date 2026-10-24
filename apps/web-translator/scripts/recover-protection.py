#!/usr/bin/env python3
"""Inspect existing owned protection; recovery is a separate explicit approval.

No password-file writes, application, model, delete, chmod or WordPress access.
"""
import argparse
import hashlib
import hmac
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import secrets
import warnings

spec=importlib.util.spec_from_file_location('provision',Path(__file__).with_name('provision-protection.py'))
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
t=p.t
require=t.require
PROBE=t.PROTECTION_PROBE
BODY=t.PROTECTION_PROBE_BYTES
KNOWN_DENY_SHA='62ab5d71604e646b74beedd6e68212f9d345c1e55cdaf21714b7745e2a531eb1'
KNOWN_FINAL_SHA='6cce9fbe92ca2ac00d80b228d0dd716f96982a001a6e31aa718e58a5bc80b758'


class RecoveryFTPS(p.ProtectionFTPS):
    def putcmd(self,line):
        verb,_,arg=line.partition(' ')
        require(verb not in ['APPE','SITE'], 'Recovery never changes the password file or permissions')
        if verb=='STOR':require(arg!=p.HASH_REMOTE,'Password file is read-only during recovery')
        if verb in ['RETR','RNTO'] and arg==PROBE:
            require('\r' not in line and '\n' not in line,'FTP control injection rejected')
            return t.VerifiedFTPS.putcmd(self,line)
        return super().putcmd(line)


class InspectionFTPS(RecoveryFTPS):
    def putcmd(self,line):
        require(line.partition(' ')[0] not in ['STOR','RNFR','RNTO','APPE','SITE'], 'Inspection cannot write')
        return super().putcmd(line)


class Recovery(p.Provision):
    def __init__(self,auth,connector,fetch=t.https_get):
        super().__init__(auth,b'',connector,fetch)
        self.old_final=self.final
        require(hashlib.sha256(self.deny).hexdigest()==KNOWN_DENY_SHA and
                hashlib.sha256(self.old_final).hexdigest()==KNOWN_FINAL_SHA,'Frozen failed-run configurations changed; STOP')
        self.recovered=self.old_final.replace(b'DirectoryIndex index.html\n',
                            ('DirectoryIndex index.html '+PROBE+'\n').encode())
        require(self.recovered!=self.old_final,'Expected unique child DirectoryIndex')
        self.expected=None;self.private_body=None;self.probe=None;self.marker=None;self.temps={}
        self.evidence={'operation':'inspect-recover-protection','sourceSha':os.environ.get('GITHUB_SHA'),
                       'ready':False,'applicationTransferred':False,'passwordFileChanged':False,'writes':0}

    def bounded(self,name,limit):
        facts=self.facts(root=name==p.HASH_REMOTE).get(name[1:] if name==p.HASH_REMOTE else name,{})
        require(p.regular(facts),'Inspection refuses symlinks/nonregular files')
        if facts.get('size','').isdigit():require(int(facts['size'])<=limit,'Inspection file exceeds bound')
        self.pwd();result=bytearray()
        def consume(chunk):
            if len(result)+len(chunk)>limit:
                self.client.close();raise t.DeploymentError('Inspection bound exceeded; connection discarded')
            result.extend(chunk)
        try:self.client.retrbinary('RETR '+name,consume)
        except Exception:self.client.close();raise
        return bytes(result)

    def inspect(self):
        entries=self.facts()
        require('.htaccess' in entries and set(entries)<={'.htaccess',t.MARKER,PROBE},
                'Existing target contains other files; report only, no automatic cleanup')
        body=self.bounded('.htaccess',65536)
        known={'own-deny-25e':self.deny,'own-final-25e':self.old_final,'own-recovered':self.recovered}
        kind=next((k for k,v in known.items() if body==v),None)
        self.evidence.update(childSha256=hashlib.sha256(body).hexdigest(),childClassification=kind or 'unknown',
                             childFilesMatchPresent=b'<FilesMatch' in body,
                             childRequireAllDenied=b'\nRequire all denied\n' in body,
                             childRequireValidUser=b'\nRequire valid-user\n' in body)
        require(kind is not None,'Child .htaccess does not match an exact known owned configuration')
        self.expected=body
        self.evidence['parentConfigRead']=False
        self.private_body=self.bounded(p.HASH_REMOTE,4096)
        self.private_mode()
        line=self.private_body.decode().rstrip('\n')
        require(line.count(':')==1,'Existing private hash format mismatch')
        username,encoded=line.split(':',1)
        require(username==self.auth[0] and re.fullmatch(r'\$2[by]\$12\$[./A-Za-z0-9]{53}',encoded),
                'Existing hash does not match the expected tester/cost')
        with warnings.catch_warnings():
            warnings.simplefilter('ignore',DeprecationWarning);import crypt
        require(hmac.compare_digest(crypt.crypt(self.auth[1],encoded),encoded),'Existing hash does not verify against Environment credentials')
        self.evidence.update(privateHashMatchesEnvironment=True,privateHashMode='0600')
        if PROBE in entries:
            self.probe=self.bounded(PROBE,len(BODY));require(self.probe==BODY,'Unknown protection probe')
        if t.MARKER in entries:
            self.marker=self.bounded(t.MARKER,4096)
            require(self.marker in [b'',b'protection-test\n',b'protection-recovery-test\n'],'Unknown maintenance marker content')
        self.evidence['httpBefore']=[{'path':name,'anonymous':self.fetch(name)['status'],
                                     'correctCredentials':self.fetch(name,self.auth)['status']} for name in p.PROBES]

    def guard(self):
        entries=self.facts()
        allowed={'.htaccess',*self.temps}
        if self.probe is not None:allowed.add(PROBE)
        if self.marker is not None:allowed.add(t.MARKER)
        require(set(entries)==allowed and all(p.regular(f) for f in entries.values()),'Recovery target type/list changed')
        self.read('.htaccess',self.expected)
        self.read(p.HASH_REMOTE,self.private_body)
        if self.probe is not None:self.read(PROBE,self.probe)
        if self.marker is not None:self.read(t.MARKER,self.marker)
        for name,body in self.temps.items():self.read(name,body)

    def put_owned(self,name,body):
        self.guard();self.pwd()
        require(name==t.MARKER or re.fullmatch(r'\.htaccess-provision-[0-9a-f]{32}',name),'Recovery STOR outside dedicated files')
        self.client.storbinary('STOR '+name,io.BytesIO(body));self.evidence['writes']+=1
        if name==t.MARKER:self.marker=body
        else:self.temps[name]=body
        self.read(name,body)

    def install_owned(self,body,destination='.htaccess'):
        temporary='.htaccess-provision-'+secrets.token_hex(16)
        require(temporary not in self.facts(),'Recovery temporary already exists')
        self.put_owned(temporary,body)
        self.guard();self.pwd()
        if destination==PROBE:require(self.probe is None,'Existing protection probe will not be overwritten')
        require(destination in ['.htaccess',PROBE],'Recovery rename outside protection')
        self.client.rename(temporary,destination);self.evidence['writes']+=1
        del self.temps[temporary]
        if destination=='.htaccess':self.expected=body
        else:self.probe=body
        self.read(destination,body)

    def probe_response(self):
        expected={'bytes':len(BODY),'sha256':hashlib.sha256(BODY).hexdigest()}
        response=self.fetch('',self.auth,expected)
        require(response['status']==200 and all(response.get(k)==expected[k] for k in ['bytes','sha256']),
                'Correct root credentials must return the exact static protection probe')
        require(response['headers'].get('content-type','').split(';')[0].strip()=='text/plain','Protection probe MIME mismatch')
        require(response['headers'].get('content-security-policy')==self.csp,'Protection probe CSP mismatch')

    def execute_existing(self,recover=False):
        self.client=self.connector()
        try:
            require(self.client.pwd()=='/','Recovery root mismatch')
            self.client.cwd(t.TARGET);self.pwd();self.inspect()
            if not recover:return self.evidence
            self.install_owned(self.deny)
            for name in p.PROBES:self.status(name,403)
            if self.probe is None:self.install_owned(BODY,PROBE)
            self.install_owned(self.recovered)
            for name in p.PROBES+ [PROBE]:self.status(name,401)
            self.probe_response()
            wrong=secrets.token_urlsafe(32)
            while wrong==self.auth[1]:wrong=secrets.token_urlsafe(32)
            self.status('',401,(self.auth[0],wrong))
            self.put_owned(t.MARKER,b'protection-recovery-test\n')
            for name in p.PROBES:self.status(name,503,self.auth,headers=True)
            for name in p.PROBES:self.status(name,401)
            self.put_owned(t.MARKER,b'')
            for name in p.PROBES:self.status(name,401)
            self.probe_response();self.guard()
            self.evidence.update(ready=True,anonymousRootStatus=401,wrongPasswordStatus=401,
                                 correctRootStatus=200,correctMaintenanceStatus=503,maintenanceMarkerBytes=0,
                                 htaccessSha256=hashlib.sha256(self.expected).hexdigest(),
                                 protectionProbe={'name':PROBE,'bytes':len(BODY),'sha256':hashlib.sha256(BODY).hexdigest()})
            return self.evidence
        except Exception as error:
            self.evidence['errorType']=type(error).__name__
            if isinstance(error,t.DeploymentError):self.evidence['reason']=str(error)
            # Do not turn an inspection or unexpected target into an automatic
            # writer. Approved recovery failures stay explicit for the operator.
            self.evidence['lastVerifiedConfigSha256']=hashlib.sha256(self.expected).hexdigest() if self.expected else None
            if recover and self.evidence['writes']:
                try:
                    self.client.close();self.client=self.connector()
                    require(self.client.pwd()=='/','Recovery rollback root mismatch')
                    self.client.cwd(t.TARGET);self.pwd()
                    # A known deny already active needs verification, not a write.
                    current=self.bounded('.htaccess',65536)
                    require(current in [self.deny,self.old_final,self.recovered],'Unknown current config: no rollback write')
                    self.expected=current
                    if current!=self.deny:self.install_owned(self.deny)
                    for name in p.PROBES:self.status(name,403)
                    self.evidence['rollbackDenyVerified']=True
                except Exception as rollback_error:
                    self.evidence['rollbackDenyVerified']=False
                    self.evidence['rollbackErrorType']=type(rollback_error).__name__
            return self.evidence
        finally:self.client.close()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute',action='store_true');parser.add_argument('--recover',action='store_true')
    args=parser.parse_args()
    require(args.execute and os.environ.get('INSPECTION_APPROVED')=='true','Explicit inspection approval required')
    require(re.fullmatch(r'[0-9a-f]{40}',os.environ.get('GITHUB_SHA','')) and
            os.environ.get('APPROVAL_SHA')==os.environ.get('GITHUB_SHA'),'Exact reviewed SHA required')
    if args.recover:require(os.environ.get('RECOVERY_APPROVED')=='true','Separate explicit recovery approval required')
    user,password=os.environ.get('FTPS_USERNAME',''),os.environ.get('FTPS_PASSWORD','')
    auth=(os.environ.get('TRANSLATOR_BASIC_USERNAME',''),os.environ.get('TRANSLATOR_BASIC_PASSWORD',''))
    require(user==t.FTP_USER and password and all(auth),'Required Environment credentials missing')
    client_class=RecoveryFTPS if args.recover else InspectionFTPS
    result=Recovery(auth,lambda:t.connect_ftps(user,password,client_factory=client_class)).execute_existing(args.recover)
    p.emit_evidence(result)
    raise SystemExit(0 if result.get('ready') or (not args.recover and result.get('privateHashMatchesEnvironment')) else 1)


if __name__=='__main__':
    try:main()
    except t.DeploymentError as error:
        p.emit_evidence({'operation':'inspect-recover-protection','ready':False,'error':str(error),'applicationTransferred':False});raise SystemExit(1)
    except Exception as error:
        p.emit_evidence({'operation':'inspect-recover-protection','ready':False,'errorType':type(error).__name__,'applicationTransferred':False});raise SystemExit(1)

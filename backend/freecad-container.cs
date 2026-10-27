// Runs a native CAD interpreter in a Windows AppContainer with no capabilities.
// Only the private job directory is granted to its unique package SID.
using System;
using System.IO;
using System.Text;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Collections.Generic;

class CadContainer {
 [StructLayout(LayoutKind.Sequential)] struct CAPS {public IntPtr Sid,Capabilities;public int Count,Reserved;}
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct STARTUP {public int cb;public string reserved,desktop,title;public int x,y,xs,ys,xc,yc,fill,flags;public short show,cbReserved;public IntPtr reserved2,input,output,error;}
 [StructLayout(LayoutKind.Sequential)] struct STARTUPEX {public STARTUP si;public IntPtr attributes;}
 [StructLayout(LayoutKind.Sequential)] struct PROCESS {public IntPtr process,thread;public int pid,tid;}
 [StructLayout(LayoutKind.Sequential)] struct BASICLIMIT {public long perProcess,perJob;public uint flags;public UIntPtr minimum,maximum;public uint active;public UIntPtr affinity;public uint priority,scheduling;}
 [StructLayout(LayoutKind.Sequential)] struct IO {public ulong readOps,writeOps,otherOps,readBytes,writeBytes,otherBytes;}
 [StructLayout(LayoutKind.Sequential)] struct JOBLIMIT {public BASICLIMIT basic;public IO io;public UIntPtr processMemory,jobMemory,peakProcess,peakJob;}
 [DllImport("userenv.dll",CharSet=CharSet.Unicode)] static extern int CreateAppContainerProfile(string name,string display,string description,IntPtr capabilities,int count,out IntPtr sid);
 [DllImport("userenv.dll",CharSet=CharSet.Unicode)] static extern int DeleteAppContainerProfile(string name);
 [DllImport("advapi32.dll")] static extern IntPtr FreeSid(IntPtr sid);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,int flags,ref IntPtr size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attribute,IntPtr value,IntPtr size,IntPtr previous,IntPtr returned);
 [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string app,StringBuilder cmd,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr env,string cwd,ref STARTUPEX startup,out PROCESS process);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetHandleInformation(IntPtr handle,uint mask,uint flags);
 [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle,uint timeout);
 [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr handle,out uint code);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attributes,string name);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int cls,ref JOBLIMIT info,int length);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
 [DllImport("kernel32.dll")] static extern uint ResumeThread(IntPtr thread);
 static void Win(bool ok){if(!ok)throw new Win32Exception(Marshal.GetLastWin32Error());}
 static string Quote(string s){return "\""+s.Replace("\\", "\\").Replace("\"","\\\"")+"\"";}
 static int Main(string[] args){
  if(args.Length==2&&args[0]=="--cleanup"&&System.Text.RegularExpressions.Regex.IsMatch(args[1],"^formnaro[.]cad[.][a-f0-9]{32}$")){DeleteAppContainerProfile(args[1]);return 0;}
  string name=args.Length==4?args[3]:"formnaro.cad."+Guid.NewGuid().ToString("N");IntPtr sid=IntPtr.Zero,attrs=IntPtr.Zero,capsPtr=IntPtr.Zero,job=IntPtr.Zero;
  PROCESS pi=new PROCESS();
  try{
   if((args.Length!=3&&args.Length!=4)||!System.Text.RegularExpressions.Regex.IsMatch(name,"^formnaro[.]cad[.][a-f0-9]{32}$"))throw new ArgumentException("Expected executable, job directory, worker filename, optional package name");
   string exe=Path.GetFullPath(args[0]),dir=Path.GetFullPath(args[1]),worker=Path.GetFullPath(args[2]);
   if(!worker.StartsWith(dir+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||!File.Exists(exe))throw new ArgumentException("Invalid CAD job");
   // Portable copies below Downloads/OneDrive do not inherit the Program Files
   // AppContainer read permission. Grant read/execute only to the CAD bundle;
   // never to its parent application, profile, or user directories.
   string runtime=Path.GetDirectoryName(Path.GetDirectoryName(exe));
   if(File.Exists(Path.Combine(runtime,"manifest.json"))){
    var packages=new SecurityIdentifier("S-1-15-2-1");var runtimeAcl=Directory.GetAccessControl(runtime);bool readable=false;
    foreach(FileSystemAccessRule rule in runtimeAcl.GetAccessRules(true,true,typeof(SecurityIdentifier)))if(rule.IdentityReference.Equals(packages)&&rule.AccessControlType==AccessControlType.Allow&&(rule.FileSystemRights&FileSystemRights.ReadAndExecute)==FileSystemRights.ReadAndExecute&&(rule.InheritanceFlags&(InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit))==(InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit))readable=true;
    if(!readable){runtimeAcl.AddAccessRule(new FileSystemAccessRule(packages,FileSystemRights.ReadAndExecute,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));Directory.SetAccessControl(runtime,runtimeAcl);}
   }
   // The host executes this launcher again for cleanup. Its binary must never
   // be inside, or writable from, the untrusted CAD working directory.
   string host=Path.GetFullPath(AppDomain.CurrentDomain.BaseDirectory);
   if(host.TrimEnd(Path.DirectorySeparatorChar).Equals(dir.TrimEnd(Path.DirectorySeparatorChar),StringComparison.OrdinalIgnoreCase))throw new ArgumentException("CAD host launcher must be outside the model workspace");
   var hostAcl=Directory.GetAccessControl(host);hostAcl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier("S-1-15-2-1"),FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Deny));Directory.SetAccessControl(host,hostAcl);
   int hr=CreateAppContainerProfile(name,name,"Local Formnaro CAD computation",IntPtr.Zero,0,out sid);if(hr!=0)Marshal.ThrowExceptionForHR(hr);
   var identity=new SecurityIdentifier(sid);var acl=Directory.GetAccessControl(dir);
   acl.AddAccessRule(new FileSystemAccessRule(identity,FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));Directory.SetAccessControl(dir,acl);
   IntPtr size=IntPtr.Zero;InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref size);attrs=Marshal.AllocHGlobal(size);Win(InitializeProcThreadAttributeList(attrs,1,0,ref size));
   CAPS caps=new CAPS();caps.Sid=sid;capsPtr=Marshal.AllocHGlobal(Marshal.SizeOf(caps));Marshal.StructureToPtr(caps,capsPtr,false);
   Win(UpdateProcThreadAttribute(attrs,0,new IntPtr(0x20009),capsPtr,new IntPtr(Marshal.SizeOf(caps)),IntPtr.Zero,IntPtr.Zero));
   job=CreateJobObject(IntPtr.Zero,null);Win(job!=IntPtr.Zero);JOBLIMIT limit=new JOBLIMIT();limit.basic.flags=0x2000;Win(SetInformationJobObject(job,9,ref limit,Marshal.SizeOf(limit)));
   using(var log=new FileStream(Path.Combine(dir,"process.log"),FileMode.Create,FileAccess.Write,FileShare.ReadWrite))
   using(var input=new FileStream(Path.Combine(dir,"stdin.txt"),FileMode.OpenOrCreate,FileAccess.Read,FileShare.ReadWrite)){
    IntPtr lh=log.SafeFileHandle.DangerousGetHandle(),ih=input.SafeFileHandle.DangerousGetHandle();Win(SetHandleInformation(lh,1,1));Win(SetHandleInformation(ih,1,1));
    STARTUPEX si=new STARTUPEX();si.si.cb=Marshal.SizeOf(si);si.si.flags=0x100;si.si.input=ih;si.si.output=lh;si.si.error=lh;si.attributes=attrs;
    string command=Quote(exe)+" --user-cfg "+Quote(Path.Combine(dir,"user.cfg"))+" --system-cfg "+Quote(Path.Combine(dir,"system.cfg"))+" "+Quote(worker);
    Win(CreateProcess(exe,new StringBuilder(command),IntPtr.Zero,IntPtr.Zero,true,0x00080000|0x08000000|0x00000004,IntPtr.Zero,dir,ref si,out pi));
    Win(AssignProcessToJobObject(job,pi.process));ResumeThread(pi.thread);WaitForSingleObject(pi.process,0xffffffff);uint code;Win(GetExitCodeProcess(pi.process,out code));return unchecked((int)code);
   }
  }catch(Exception e){Console.Error.WriteLine("CAD_CONTAINER: "+e.Message);return 125;}
  finally{if(job!=IntPtr.Zero)CloseHandle(job);if(pi.thread!=IntPtr.Zero)CloseHandle(pi.thread);if(pi.process!=IntPtr.Zero)CloseHandle(pi.process);if(attrs!=IntPtr.Zero){DeleteProcThreadAttributeList(attrs);Marshal.FreeHGlobal(attrs);}if(capsPtr!=IntPtr.Zero)Marshal.FreeHGlobal(capsPtr);if(sid!=IntPtr.Zero)FreeSid(sid);DeleteAppContainerProfile(name);}
 }
}

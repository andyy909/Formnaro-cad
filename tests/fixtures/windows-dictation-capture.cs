// Native integration fixture: capture and swallow injected Win+H so testing
// never opens voice typing or activates a microphone.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;
internal static class CaptureDictation
{
    delegate IntPtr KeyboardHook(int code, IntPtr message, IntPtr data);
    [StructLayout(LayoutKind.Sequential)] struct KeyData { public uint key,scan,flags,time; public UIntPtr extra; }
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, KeyboardHook hook, IntPtr module, uint thread);
    [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook,int code,IntPtr message,IntPtr data);
    [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);
    static IntPtr hook;
    static readonly List<string> keys=new List<string>();
    static readonly KeyboardHook callback=OnKey;
    static IntPtr OnKey(int code,IntPtr message,IntPtr data)
    {
        if(code>=0) {
            KeyData key=(KeyData)Marshal.PtrToStructure(data,typeof(KeyData));
            if((key.flags & 0x10)!=0 && (key.key==0x5B || key.key==0x48)) {
                keys.Add(key.key.ToString("x")+":"+message.ToInt32().ToString("x"));
                return new IntPtr(1);
            }
        }
        return CallNextHookEx(hook,code,message,data);
    }
    [STAThread] static int Main(string[] args)
    {
        if(args.Length!=2)return 2;
        int status=1,exit=-1;
        Application.EnableVisualStyles();
        using(Form form=new Form()) {
            form.Text="Formnaro · Windows-Diktat Tastentest ohne Mikrofon";
            form.Width=560;form.Height=160;
            TextBox text=new TextBox {Dock=DockStyle.Fill,Multiline=true,Text="Prüft die Tastenkombination ohne Sprachaufnahme."};form.Controls.Add(text);
            Process process=null;int ticks=0;
            Timer timer=new Timer {Interval=100};
            form.Shown+=delegate {
                hook=SetWindowsHookEx(13,callback,GetModuleHandle(Process.GetCurrentProcess().MainModule.ModuleName),0);
                if(hook==IntPtr.Zero){form.Close();return;}
                timer.Start();
            };
            timer.Tick+=delegate {
                ticks++;
                if(ticks==3){IntPtr target=GetForegroundWindow();uint owner;GetWindowThreadProcessId(target,out owner);process=Process.Start(new ProcessStartInfo(args[0],"--dictate "+target.ToInt64().ToString("x")+" "+owner) {UseShellExecute=false,CreateNoWindow=true});}
                if(process!=null && process.HasExited && keys.Count>=4 || ticks>50){if(process!=null&&process.HasExited)exit=process.ExitCode;timer.Stop();form.Close();}
            };
            try{Application.Run(form);}finally{timer.Dispose();if(hook!=IntPtr.Zero)UnhookWindowsHookEx(hook);if(process!=null){if(!process.HasExited)process.Kill();process.Dispose();}}
        }
        status=exit==0 && String.Join(",",keys.ToArray())=="5b:100,48:100,48:101,5b:101" ? 0 : 1;
        File.WriteAllText(args[1],"{\"ok\":"+(status==0?"true":"false")+",\"helperExit\":"+exit+",\"keys\":[\""+String.Join("\",\"",keys.ToArray())+"\"],\"swallowed\":true,\"microphoneActivated\":false}");
        return status;
    }
}

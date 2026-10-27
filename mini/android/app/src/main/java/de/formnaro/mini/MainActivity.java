package de.formnaro.mini;

import android.app.*;
import android.os.*;
import android.content.*;
import android.database.Cursor;
import android.provider.OpenableColumns;
import android.graphics.BitmapFactory;
import android.webkit.*;
import android.net.Uri;
import android.util.Base64;
import android.util.AtomicFile;
import androidx.webkit.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** Offline host. Only the bundled main frame may call the native file bridge. */
public class MainActivity extends Activity {
    private static final String ORIGIN="https://appassets.androidplatform.net";
    private static final int PROJECT=32*1024*1024, STL=25*1024*1024;
    private WebView web;
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private Pending picker;
    private static class Pending {
        int id; String action; byte[] bytes; JavaScriptReplyProxy reply;
        Pending(int id,String action,byte[] bytes,JavaScriptReplyProxy reply){this.id=id;this.action=action;this.bytes=bytes;this.reply=reply;}
    }
    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        web=new WebView(this);android.widget.FrameLayout root=new android.widget.FrameLayout(this);root.setBackgroundColor(android.graphics.Color.WHITE);root.addView(web,new android.widget.FrameLayout.LayoutParams(-1,-1));setContentView(root);
        getWindow().getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        root.setOnApplyWindowInsetsListener((view,insets)->{view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets.consumeSystemWindowInsets();});
        root.requestApplyInsets();
        WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setJavaScriptCanOpenWindowsAutomatically(false);s.setSupportMultipleWindows(false);s.setMediaPlaybackRequiresUserGesture(true);
        if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){
            new AlertDialog.Builder(this).setTitle("Android System WebView aktualisieren").setMessage("Bitte Android System WebView im Play Store aktualisieren und Mini erneut starten.").setPositiveButton("Schließen",(d,w)->finish()).setCancelable(false).show();return;
        }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebViewAssetLoader loader=new WebViewAssetLoader.Builder().addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest request){return asset(loader,request.getUrl());}
            @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return true;}
            @Override public void onReceivedError(WebView v,WebResourceRequest r,WebResourceError e){if(r.isForMainFrame())new AlertDialog.Builder(MainActivity.this).setMessage("Mini konnte nicht geladen werden: "+e.getDescription()).setPositiveButton("Schließen",(d,w)->finish()).show();}
        });
        if(WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE))ServiceWorkerControllerCompat.getInstance().setServiceWorkerClient(new ServiceWorkerClientCompat(){@Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest r){return asset(loader,r.getUrl());}});
        WebViewCompat.addWebMessageListener(web,"FormnaroNative",Set.of(ORIGIN),(view,message,origin,main,reply)->{
            if(!main||!ORIGIN.equals(origin.toString()))return;
            try{JSONObject data=new JSONObject(message.getData());int id=data.getInt("id");String action=data.getString("action");JSONObject args=data.optJSONObject("args");io.execute(()->{
                try{if(action.startsWith("open")||action.startsWith("save")){document(id,action,args,reply);return;}respond(reply,id,execute(action,args));}
                catch(Exception e){fail(reply,id,e);}
            });}catch(Exception ignored){}
        });
        web.loadUrl(ORIGIN+"/assets/index.html");
    }
    private WebResourceResponse asset(WebViewAssetLoader loader,Uri uri){
        WebResourceResponse response=loader.shouldInterceptRequest(uri);
        if(response==null)return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",Map.of(),new ByteArrayInputStream(new byte[0]));
        String path=uri.getPath();if(path!=null){if(path.endsWith(".wasm"))response.setMimeType("application/wasm");if(path.endsWith(".js"))response.setMimeType("text/javascript");}
        response.setResponseHeaders(Map.of("Content-Security-Policy","default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'"));return response;
    }
    private JSONObject ok() throws JSONException{return new JSONObject().put("ok",true);}
    private void respond(JavaScriptReplyProxy reply,int id,JSONObject result){runOnUiThread(()->{try{reply.postMessage(new JSONObject().put("id",id).put("result",result).toString());}catch(Exception ignored){}});}
    private void fail(JavaScriptReplyProxy reply,int id,Exception e){try{respond(reply,id,new JSONObject().put("ok",false).put("error",e.getMessage()==null?"Dateizugriff fehlgeschlagen":e.getMessage()));}catch(Exception ignored){}}
    private File local(String name){return new File(getFilesDir(),name);}
    private byte[] read(InputStream input,int max)throws Exception{if(input==null)throw new IOException("Datei nicht lesbar.");try(InputStream in=input;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] block=new byte[65536];int n;while((n=in.read(block))!=-1){if(out.size()+n>max)throw new IOException("Datei überschreitet das Größenlimit.");out.write(block,0,n);}return out.toByteArray();}}
    private byte[] read(File file,int max)throws Exception{return read(new AtomicFile(file).openRead(),max);}
    private String text(File file,int max)throws Exception{return new String(read(file,max),StandardCharsets.UTF_8);}
    private void atomic(File file,byte[] data)throws Exception{File parent=file.getParentFile();if(!parent.exists()&&!parent.mkdirs())throw new IOException("Speicherordner nicht verfügbar.");AtomicFile atomic=new AtomicFile(file);FileOutputStream out=null;try{out=atomic.startWrite();out.write(data);atomic.finishWrite(out);}catch(Exception e){if(out!=null)atomic.failWrite(out);throw e;}}
    private byte[] project(JSONObject args)throws Exception{String text=args.getString("text");byte[] bytes=text.getBytes(StandardCharsets.UTF_8);if(bytes.length>PROJECT)throw new IOException("Projekt ist größer als 32 MB.");JSONObject p=new JSONObject(text);if(!"Formnaro-Mini".equals(p.optString("format"))||p.optInt("version")!=1||p.getJSONArray("nodes").length()>200)throw new IOException("Ungültiges Mini-Projekt.");return bytes;}
    private JSONObject metadata(JSONObject a,long saved)throws Exception{String name=a.getString("name").trim(),folder=a.optString("folder","").trim();if(name.isEmpty()||name.length()>100||folder.length()>100)throw new IOException("Ungültiger Bibliotheksname oder Ordner.");return new JSONObject().put("name",name).put("folder",folder).put("favorite",a.getBoolean("favorite")).put("saved",saved);}
    private File entry(String id)throws Exception{if(!id.matches("[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}"))throw new IOException("Ungültiger Bibliothekseintrag.");return local("Bibliothek/"+id);}
    private JSONObject execute(String action,JSONObject a)throws Exception{
        switch(action){
            case "close":{String error=a.optString("error","");runOnUiThread(()->{if(!error.isEmpty()&&!error.equals("null"))new AlertDialog.Builder(this).setMessage("Sicherung fehlgeschlagen: "+error+". Bitte das Projekt speichern.").setPositiveButton("Zurück",null).show();else finish();});return ok();}
            case "restore":{
                JSONObject result=ok().put("verification",false);File saved=local("autosave.fmini");
                if(saved.exists()||local("autosave.fmini.bak").exists())try{result.put("text",text(saved,PROJECT));}catch(Exception e){result.put("error",e.getMessage());}
                try{result.put("settings",new JSONObject(text(local("einstellungen.json"),8192)));}catch(Exception ignored){}return result;
            }
            case "autosave":atomic(local("autosave.fmini"),project(a));return ok();
            case "settings":{
                int quality=a.getInt("quality");double snap=a.getDouble("snap");if(!Set.of(32,64,128).contains(quality)||!Set.of(0d,.1d,1d,5d).contains(snap))throw new IOException("Ungültige Einstellungen.");
                atomic(local("einstellungen.json"),new JSONObject().put("quality",quality).put("snap",snap).put("surfaceAlign",a.getBoolean("surfaceAlign")).toString().getBytes(StandardCharsets.UTF_8));return ok();
            }
            case "libraryList":{
                JSONArray entries=new JSONArray();int skipped=0;File[] dirs=local("Bibliothek").listFiles();if(dirs!=null)for(File dir:dirs){if(!dir.isDirectory()||dir.getName().startsWith("."))continue;try{File valid=entry(dir.getName());JSONObject meta=new JSONObject(text(new File(valid,"meta.json"),8192));entries.put(metadata(meta,meta.getLong("saved")).put("id",dir.getName()));}catch(Exception e){skipped++;}}return ok().put("entries",entries).put("skipped",skipped);
            }
            case "librarySave":{
                byte[] model=project(a);JSONObject meta=metadata(a,System.currentTimeMillis());String image=a.getString("image");if(image.length()>360000||!image.startsWith("data:image/png;base64,"))throw new IOException("Ungültiges Vorschaubild.");byte[] png=Base64.decode(image.substring(22),Base64.DEFAULT);
                BitmapFactory.Options size=new BitmapFactory.Options();size.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(png,0,png.length,size);if(png.length>256*1024||size.outWidth<1||size.outHeight<1||size.outWidth>512||size.outHeight>512||!"image/png".equals(size.outMimeType))throw new IOException("Ungültiges PNG-Bild.");
                String id=UUID.randomUUID().toString();File target=entry(id),temp=local("Bibliothek/."+id);atomic(new File(temp,"model.fmini"),model);atomic(new File(temp,"preview.png"),png);atomic(new File(temp,"meta.json"),meta.toString().getBytes(StandardCharsets.UTF_8));if(!temp.renameTo(target))throw new IOException("Bibliothek konnte nicht gesichert werden.");return ok().put("id",id);
            }
            case "libraryLoad":return ok().put("text",text(new File(entry(a.getString("id")),"model.fmini"),PROJECT));
            case "libraryThumbnail":return ok().put("image","data:image/png;base64,"+Base64.encodeToString(read(new File(entry(a.getString("id")),"preview.png"),256*1024),Base64.NO_WRAP));
            case "libraryUpdate":{
                File file=new File(entry(a.getString("id")),"meta.json");JSONObject previous=new JSONObject(text(file,8192));atomic(file,metadata(a,previous.getLong("saved")).toString().getBytes(StandardCharsets.UTF_8));return ok();
            }
            default:throw new IOException("Unbekannter Mini-Befehl.");
        }
    }
    private void document(int id,String action,JSONObject args,JavaScriptReplyProxy reply)throws Exception{
        boolean save=action.equals("saveProject")||action.equals("saveExport");if(!save&&!action.equals("openProject")&&!action.equals("openSTL"))throw new IOException("Unbekannter Dateibefehl.");
        byte[] bytes=null;if(action.equals("saveProject"))bytes=project(args);
        if(action.equals("saveExport")){
            String encoded=args.getString("base64");if(encoded.length()>140*1024*1024)throw new IOException("STL-Ausgabe zu groß.");bytes=Base64.decode(encoded,Base64.DEFAULT);
            if(bytes.length<84||bytes.length>100*1024*1024||84L+Integer.toUnsignedLong(java.nio.ByteBuffer.wrap(bytes,80,4).order(java.nio.ByteOrder.LITTLE_ENDIAN).getInt())*50!=bytes.length)throw new IOException("Ungültige STL-Ausgabe.");
        }
        Pending next=new Pending(id,action,bytes,reply);
        runOnUiThread(()->{try{
            if(picker!=null)throw new IOException("Ein Dateidialog ist bereits geöffnet.");picker=next;
            Intent intent=new Intent(save?Intent.ACTION_CREATE_DOCUMENT:Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(save?"application/octet-stream":"*/*");
            if(save){String name=args.optString("name","Mini-Projekt").replaceAll("[<>:\"/\\\\|?*\\x00-\\x1f]","-");if(name.length()>90)name=name.substring(0,90);intent.putExtra(Intent.EXTRA_TITLE,name+(action.equals("saveProject")?".fmini":".stl"));}
            startActivityForResult(intent,41);
        }catch(Exception e){if(picker==next)picker=null;fail(reply,id,e);}});
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);if(request!=41||picker==null)return;Pending p=picker;picker=null;
        if(result!=RESULT_OK||data==null||data.getData()==null){try{respond(p.reply,p.id,new JSONObject().put("ok",false));}catch(Exception ignored){}return;}
        Uri uri=data.getData();io.execute(()->{try{
            if(p.bytes!=null){try(OutputStream out=getContentResolver().openOutputStream(uri,"wt")){if(out==null)throw new IOException("Datei nicht schreibbar.");out.write(p.bytes);}respond(p.reply,p.id,ok());}
            else{byte[] bytes=read(getContentResolver().openInputStream(uri),p.action.equals("openSTL")?STL:PROJECT);if(p.action.equals("openProject"))respond(p.reply,p.id,ok().put("text",new String(bytes,StandardCharsets.UTF_8)));else{
                String name="Import.stl";try(Cursor c=getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)){if(c!=null&&c.moveToFirst())name=c.getString(0);}respond(p.reply,p.id,ok().put("name",name).put("base64",Base64.encodeToString(bytes,Base64.NO_WRAP)));
            }}
        }catch(Exception e){fail(p.reply,p.id,e);}});
    }
    @Override public void onBackPressed(){web.evaluateJavascript("window.dispatchEvent(new Event('mini-back'))",null);}
    @Override protected void onPause(){web.evaluateJavascript("window.dispatchEvent(new Event('mini-background'))",null);super.onPause();}
    @Override protected void onDestroy(){io.shutdown();web.destroy();super.onDestroy();}
}


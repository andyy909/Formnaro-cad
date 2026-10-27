"""Non-modal source-region editor; geometric acceptance runs in the CAD worker."""
import json
from pathlib import Path
import tkinter as tk
from tkinter import ttk,filedialog

from .region_edits import RegionEditSession,RegionEditError

TYPE_NAMES={'AUTO':'Automatisch','PLANE':'Ebene','CYLINDER':'Zylinder','CONE':'Kegel',
            'GRAPH':'Freiform','REVOLUTION':'Drehfläche','REST':'Facetten'}


class RegionEditor:
    def __init__(self,app):
        self.app=app
        self.window=tk.Toplevel(app.root)
        app.region_dialog=self.window
        self.window.title('Flächen korrigieren · Originalnetz')
        self.window.geometry(f'580x640+{app.root.winfo_rootx()+12}+{app.root.winfo_rooty()+100}')
        self.window.minsize(550,520)
        self.window.protocol('WM_DELETE_WINDOW',self.close)
        frame=ttk.Frame(self.window,padding=12)
        frame.pack(fill='both',expand=True)
        ttk.Label(frame,text='Bereiche in der Liste oder am Modell wählen. Strg/Shift erlaubt Mehrfachauswahl.',
                  wraplength=540).pack(anchor='w')
        row=ttk.Frame(frame)
        row.pack(fill='x',pady=8)
        ttk.Label(row,text='Am Modell:').pack(side='left')
        self.mode=ttk.Combobox(row,textvariable=app.region_pick_mode,state='readonly',width=18,
                             values=['Drehen','Bereiche','Dreiecke'])
        self.mode.pack(side='left',padx=8)
        self.mode.bind('<<ComboboxSelected>>',lambda _:app.set_region_pick_mode())
        ttk.Button(row,text='Markierung leeren',command=self.clear_faces).pack(side='right')
        ttk.Label(frame,text='Dreiecke: Klick markiert die vordere Fläche; Rechteck markiert Dreiecksmitten, auch verdeckte. Zum Teilen einen Bereich wählen.',
                  wraplength=540).pack(anchor='w',pady=(0,8))
        shell=ttk.Frame(frame)
        shell.pack(fill='both',expand=True)
        self.tree=ttk.Treeview(shell,columns=('type','faces','radius','protection'),show='headings',selectmode='extended')
        for key,title,width in [('type','Typ',120),('faces','Dreiecke',75),('radius','Radius mm',135),('protection','Schutz',100)]:
            self.tree.heading(key,text=title)
            self.tree.column(key,width=width,stretch=True)
        scroll=ttk.Scrollbar(shell,orient='vertical',command=self.tree.yview)
        self.tree.configure(yscrollcommand=scroll.set)
        scroll.pack(side='right',fill='y')
        self.tree.pack(fill='both',expand=True)
        self.tree.bind('<<TreeviewSelect>>',self.select)
        self.details=tk.StringVar()
        ttk.Label(frame,textvariable=self.details,wraplength=540).pack(fill='x',pady=8)
        row=ttk.Frame(frame);row.pack(fill='x',pady=3)
        self.type=tk.StringVar(value='Automatisch')
        ttk.Combobox(row,textvariable=self.type,values=list(TYPE_NAMES.values()),state='readonly',width=15).pack(side='left')
        self.buttons=[]
        def button(parent,text,command):
            item=ttk.Button(parent,text=text,command=command)
            item.pack(side='left',padx=(4,0));self.buttons.append(item)
            return item
        button(row,'Typ übernehmen',self.set_type)
        button(row,'Teilen',self.split)
        button(row,'Zusammenführen',self.merge)
        row=ttk.Frame(frame);row.pack(fill='x',pady=3)
        button(row,'Schützen',lambda:self.protect(True))
        button(row,'Schutz lösen',lambda:self.protect(False))
        self.undo_button=button(row,'Rückgängig',self.undo)
        self.redo_button=button(row,'Wiederholen',self.redo)
        row=ttk.Frame(frame);row.pack(fill='x',pady=3)
        button(row,'Korrektur speichern …',self.save)
        button(row,'Korrektur laden …',self.load)
        self.status=tk.StringVar(value='Typen bleiben Vorschläge. Geschützte Dreiecke bleiben Originalfacetten; die Konvertierung prüft CAD und STEP.')
        ttk.Label(frame,textvariable=self.status,wraplength=540).pack(fill='x',pady=(8,0))
        self.window.bind('<Control-z>',lambda _:self.undo())
        self.window.bind('<Control-y>',lambda _:self.redo())
        self.refresh()

    @property
    def session(self):
        return self.app.region_edits

    def refresh(self):
        self.tree.delete(*self.tree.get_children())
        for region in self.app.region_analysis.regions:
            radius=region.get('radius_mm')
            if radius is not None:radius=f'{radius:.6g}'
            elif region['type']=='CONE' and 'radius_min_mm' in region:
                radius=f"{region['radius_min_mm']:.5g}–{region['radius_max_mm']:.5g}"
            else:radius='–'
            count=region.get('protected_faces',0)
            self.tree.insert('','end',iid=str(region.get('edit_id',region['id'])),values=(
                TYPE_NAMES[region['type']],len(region['faces']),radius,f'{count}/{len(region["faces"])}' if count else '–'))
        active=set(self.session.state.labels)
        self.app.selected_regions &= active
        self.app.selected_region=min(self.app.selected_regions) if self.app.selected_regions else None
        self.tree.selection_set([str(i) for i in sorted(self.app.selected_regions)])
        self.undo_button.configure(state='normal' if self.session.can_undo and self.app.process is None else 'disabled')
        self.redo_button.configure(state='normal' if self.session.can_redo and self.app.process is None else 'disabled')
        self.update_details()

    def update_details(self):
        selected=self.app.selected_regions
        descriptions=[r['reason'] for r in self.app.region_analysis.regions if r.get('edit_id',r['id']) in selected]
        self.details.set(f'{len(selected)} Bereiche · {len(self.app.selected_faces)} Dreiecke markiert. '+
                         (descriptions[0] if len(descriptions)==1 else ''))

    def select(self,_=None):
        selected={int(i) for i in self.tree.selection()}
        self.app.selected_regions=selected
        self.app.selected_region=min(selected) if selected else None
        if len(selected)==1:
            self.type.set(TYPE_NAMES[dict(self.session.state.requested_types).get(next(iter(selected)),'AUTO')])
        self.update_details()
        self.app.view.set('Flächenarten')
        self.app.draw()

    def _apply(self,action):
        try:
            if self.app.process is not None:
                raise RegionEditError('Während der Konvertierung sind die Korrekturen gesperrt.')
            result=action()
            if type(result) is int:self.app.selected_regions={result}
            elif isinstance(result,tuple):self.app.selected_regions=set(result)
            self.app.selected_faces.clear()
            self.app.refresh_region_edits()
            self.status.set('Korrektur gespeichert. Die nächste Konvertierung prüft Fits, gemeinsame Ränder und geschützte Flächen.')
        except (ValueError,OSError) as exc:
            self.status.set(str(exc))

    def _selection(self):
        if not self.app.selected_regions:
            raise RegionEditError('Zuerst einen oder mehrere Bereiche auswählen.')
        return sorted(self.app.selected_regions)

    def split(self):
        def action():
            selection=self._selection()
            if len(selection)!=1:
                raise RegionEditError('Zum Teilen genau einen Bereich und darin Dreiecke markieren.')
            return self.session.split(selection[0],self.app.selected_faces)
        self._apply(action)

    def merge(self):
        self._apply(lambda:self.session.merge(self._selection()))

    def set_type(self):
        def action():
            kind=next(key for key,value in TYPE_NAMES.items() if value==self.type.get())
            with self.session.transaction():
                for region in self._selection():self.session.set_type(region,kind)
        self._apply(action)

    def protect(self,enabled):
        self._apply(lambda:self.session.protect(self._selection(),enabled))

    def undo(self):self._apply(self.session.undo)
    def redo(self):self._apply(self.session.redo)

    def clear_faces(self):
        self.app.selected_faces.clear();self.update_details();self.app.draw()

    def save(self):
        if self.app.process is not None:return
        path=filedialog.asksaveasfilename(parent=self.window,title='Regionskorrektur speichern',defaultextension='.json',
             initialfile=Path(self.app.source).stem+'.regionen.json',filetypes=[('Regionskorrektur','*.json')])
        if path:
            try:
                if Path(path).resolve()==Path(self.app.source).resolve():
                    raise RegionEditError('Die Original-STL darf nicht überschrieben werden.')
                Path(path).write_text(json.dumps(self.session.to_dict(),indent=2,ensure_ascii=False),encoding='utf-8')
                self.status.set('Regionskorrektur gespeichert; an dieses Originalnetz und Budget gebunden.')
            except (ValueError,OSError) as exc:self.status.set(str(exc))

    def load(self):
        if self.app.process is not None:return
        path=filedialog.askopenfilename(parent=self.window,title='Regionskorrektur laden',filetypes=[('Regionskorrektur','*.json')])
        if path:
            def action():
                if Path(path).stat().st_size>5_000_000:
                    raise RegionEditError('Die Regionskorrektur ist zu groß.')
                value=json.loads(Path(path).read_text(encoding='utf-8'))
                loaded=RegionEditSession.from_dict(self.app.region_mesh,self.app.region_base_analysis,self.session.tolerance,value)
                # Loading a valid state itself is undoable.
                state=loaded.state
                self.session._commit(state.labels,dict(state.base_types),dict(state.requested_types),state.protected_faces,state.next_id)
            self._apply(action)

    def close(self):
        self.app.region_dialog=None;self.app.region_editor=None
        self.app.region_pick_mode.set('Drehen');self.app.set_region_pick_mode()
        self.window.destroy()

// Resolve System once for both CSS and the 3D view; react without saving settings.
export function createThemeBinding({document,media,setViewTheme}){
  let preference='light';
  const refresh=()=>{const dark=preference==='dark'||preference==='system'&&media.matches;const theme=dark?'dark':'light';document.documentElement.dataset.theme=theme;document.body.dataset.theme=theme;setViewTheme(dark);};
  const changed=()=>{if(preference==='system')refresh();};
  media.addEventListener('change',changed);
  return {set(value){preference=value;refresh();},dispose(){media.removeEventListener('change',changed);}};
}

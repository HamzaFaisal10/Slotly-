export const THEME_KEY = "slotly-theme";
const KEY = THEME_KEY;

/** Runs before first paint (inlined in <head>) so there's no flash of the wrong theme. */
export const themeBootScript = `(function(){try{var q=new URLSearchParams(location.search).get("theme");var ok=${JSON.stringify(
  ["blush", "sage", "midnight", "graphite"],
)};var t=ok.indexOf(q)>-1?q:localStorage.getItem("${KEY}");if(ok.indexOf(q)>-1)localStorage.setItem("${KEY}",q);if(ok.indexOf(t)>-1)document.documentElement.dataset.theme=t;}catch(e){}})();`;

<!doctype html><html><head><meta charset="utf-8">
<style>
/* Obsidian-like default dark theme tokens, just enough for the plugin's components */
:root{
 --background-primary:#1e1e1e;--background-primary-alt:#242424;--background-secondary:#262626;--background-secondary-alt:#1a1a1a;
 --background-modifier-border:#3a3a3a;--background-modifier-hover:rgba(255,255,255,.07);--background-modifier-form-field:#262626;
 --text-normal:#dadada;--text-muted:#a8a8a8;--text-faint:#6b6b6b;--text-accent:#a99cf7;--text-on-accent:#fff;
 --interactive-normal:#2f2f2f;--interactive-accent:#7f6df2;--color-green:#6dbf73;--color-red:#e5645f;
 --pomodoro-timer-color:var(--text-faint);--pomodoro-timer-elapsed-color:var(--color-green);--pomodoro-timer-text-color:var(--text-normal);--pomodoro-timer-dot-color:var(--color-red);
 --pomodoro-forest-sunlight:#ffa726;--pomodoro-forest-coin:#ffd700;--pomodoro-forest-streak:#ff7043;
}
*{box-sizing:border-box}
body{margin:0;background:var(--background-primary);color:var(--text-normal);font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif}
button,select{font:inherit;color:var(--text-normal);background:var(--interactive-normal);border:0;border-radius:6px;padding:4px 12px;height:30px;box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 1px 1px rgba(0,0,0,.4)}
h2,h3,h4{font-weight:600}
p{margin:0}
#wrap{padding:__PAD__px}
__EXTRA__
</style></head><body>
<script>
/* Fixed time of day so the sky in screenshots is deterministic */
(function(){var R=Date,h=__HOUR__,f=new R();f.setHours(h,0,0,0);var o=f-R.now();
function F(){var a=[].slice.call(arguments);if(!a.length)return new R(R.now()+o);return new (Function.prototype.bind.apply(R,[null].concat(a)))}
F.prototype=R.prototype;F.now=function(){return R.now()+o};F.parse=R.parse;F.UTC=R.UTC;window.Date=F})();
</script>
<div id="wrap"><div id="app"></div></div>
<script src="harness.js"></script>
</body></html>

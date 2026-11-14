// The veil the app opens under, and closes under when going back to the landing page (app/veil.css).
// The script runs before the first paint: it lowers the veil when the visitor has just left the
// landing page (which says so in sessionStorage, app/landing-src/leave.js) and always for Roro's
// Fire Diary, whose scene opens like a lamp being lit. <VeilWatch> lifts it on the pages that do
// not say for themselves when they are ready, and lowers it on the way back to the landing page.

import VeilWatch from "./VeilWatch";

const ARRIVE = "(function(){try{var r=document.documentElement,k='zij.veil',s=sessionStorage.getItem(k);if(s)sessionStorage.removeItem(k);if(matchMedia('(prefers-reduced-motion: reduce)').matches||/[?&]still\\b/.test(location.search))return;if(s||location.pathname==='/diary')r.classList.add('is-arriving')}catch(e){}})();";

export default function Veil() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: ARRIVE }} />
      <div className="veil" data-theme="night" aria-hidden="true">
        <svg viewBox="44 135 306 255" fill="currentColor">
          <path d="M44,200L196,200L196,225L81.47,365L196,365L196,390L44,390L44,365L158.53,225L44,225Z" /><path d="M173.18,275L218,275L218,300L152.73,300Z" /><path d="M232,200L264,200L264,300L232,300Z" /><path d="M314,200L346,200L346,349.68L313.02,390L270,390L270,365L296,365L314,343Z" /><path d="M227,156a21,21 0 1,0 42,0a21,21 0 1,0 -42,0ZM235.5,156a12.5,12.5 0 1,1 25,0a12.5,12.5 0 1,1 -25,0Z" /><path d="M330,136L350,156L330,176L310,156Z" /><path d="M140,316L156.5,332.5L140,349L123.5,332.5Z" /><path d="M227,314L243.5,330.5L227,347L210.5,330.5ZM269,314L285.5,330.5L269,347L252.5,330.5Z" />
        </svg>
        <i />
      </div>
      <VeilWatch />
    </>
  );
}

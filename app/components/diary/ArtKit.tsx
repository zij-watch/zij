"use client";

// /studio/diary: the art kit of Hudhud's Fire Diary. Every drawing with its states, each in the room
// by lamplight (Night) and on a sheet of paper (Folio), laid out like the design system's
// instruments reference. Words come from the script by id, numbers from the data.

import type { ReactNode } from "react";
import type { GameData } from "@/lib/diary/game";
import DiaryBook, { type Bar } from "./art/DiaryBook";
import { FactoryFlame, FieldFire, GhostDot } from "./art/Fire";
import Hudhud from "./art/Hudhud";
import { OrbitRing, Satellite } from "./art/Satellite";
import { Constellation, Envelope, Globe, IllusTag, PassClock, PersonToken, ReadingStone, RumourSlip, Tray, WaxSeal } from "./art/Things";
import Translator, { Balance, Gear, TwoFires, Volvelle, YearLever } from "./art/Translator";
import { FieldsCanvas, SkyCanvas, WoodCanvas } from "./Textures";
import { closeness } from "@/lib/diary/game";

function Row({ eyebrow, title, children, note }: { eyebrow: string; title: string; children: ReactNode; note?: string }) {
  return (
    <section className="kit-row">
      <div className="kit-what">
        <p className="t-eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {note && <p className="kit-note">{note}</p>}
      </div>
      <div className="kit-panes">{children}</div>
    </section>
  );
}

const Pane = ({ theme, children, wide = false, tag }: { theme: "night" | "folio"; children: ReactNode; wide?: boolean; tag?: string }) => (
  <div className={`kit-pane is-${theme}${wide ? " is-wide" : ""}`} data-theme={theme}>
    <span className="kit-tag">{tag ?? theme}</span>
    {children}
  </div>
);

const State = ({ label, children }: { label: string; children: ReactNode }) => (
  <figure className="kit-state">{children}<figcaption>{label}</figcaption></figure>
);

export default function ArtKit({ data }: { data: GameData }) {
  const L = data.lines;
  const months = Array.from({ length: 12 }, (_, i) => L[`ui.m${i + 1}`]);
  const max = Math.max(...data.seasons.map((s) => s.hi));
  const raw: Bar[] = data.seasons.filter((s) => s.year <= data.test[1]).map((s) => ({ year: s.year, value: (s.source === "MODIS" ? s.modis : s.viirs) ?? s.value, kind: s.source === "MODIS" ? "modis" : "viirs" }));
  const one: Bar[] = data.seasons.map((s) => ({ year: s.year, value: s.value, lo: s.lo, hi: s.hi, kind: s.source === "MODIS" ? "ink" : "viirs", mark: s.year === data.thisYear.year }));
  const scale = { far: L["t43.far"], close: L["t43.close"], spot: L["t43.spot"] };
  const lit = (n: number) => Array.from({ length: 15 }, (_, i) => (i < n ? (i % 4 === 3 ? "dim" : "on") : "off") as "on" | "dim" | "off");

  return (
    <main className="kit">
      <header className="kit-head">
        <p className="t-eyebrow">studio · roro&rsquo;s fire diary</p>
        <h1>The art kit</h1>
        <p className="kit-lede">Every drawing of the game, with its states, in the room by lamplight and on paper. Ink outlines, hatching, flat paper colours: drawn like an old natural-history manuscript, not a cartoon.</p>
        <a className="catchword" href="/studio/diary?script">Read the script</a>
      </header>

      <Row eyebrow="the guide" title="Roro" note="Feeling shows in the body: the crest rises, the head tilts, a short step. No face, no smile.">
        <Pane theme="night">
          <div className="kit-states">
            <State label="resting"><Hudhud /></State>
            <State label="crest up"><Hudhud crest /></State>
            <State label="head tilted, a hint"><Hudhud tilt /></State>
            <State label="with the reading stone"><Hudhud stone crest /></State>
            <State label="flying"><Hudhud fly /></State>
          </div>
        </Pane>
        <Pane theme="folio">
          <div className="kit-states">
            <State label="resting"><Hudhud /></State>
            <State label="crest up"><Hudhud crest /></State>
            <State label="flying"><Hudhud fly /></State>
          </div>
        </Pane>
      </Row>

      <Row eyebrow="the two records" title="MODIS and VIIRS" note="Brass instruments on the rete's rings. Lapis is always MODIS and rubric always VIIRS, and both are named in words.">
        <Pane theme="night">
          <div className="kit-states">
            <State label="MODIS, square eye"><Satellite kind="modis" name={L["ui.modis"]} /></State>
            <State label="VIIRS, round eye"><Satellite kind="viirs" name={L["ui.viirs"]} /></State>
            <State label="on their rings">
              <div className="kit-orbits">
                <div className="kit-orbit is-modis"><OrbitRing kind="modis" /></div>
                <div className="kit-orbit is-viirs"><OrbitRing kind="viirs" /></div>
              </div>
            </State>
          </div>
        </Pane>
        <Pane theme="night" tag="night · looking">
          <div className="kit-beams">
            <FieldsCanvas className="kit-fields" />
            <Satellite kind="modis" name={L["ui.modis"]} beam className="kit-beamsat" />
            <Satellite kind="viirs" name={L["ui.viirs"]} beam className="kit-beamsat" />
          </div>
        </Pane>
      </Row>

      <Row eyebrow="on the land" title="Fires, flames and ghosts" note="Fire is flame and the light it throws, never a glowing disc.">
        <Pane theme="night">
          <div className="kit-land">
            <FieldsCanvas className="kit-fields" />
            <div className="kit-onland">
              <State label="field fire"><FieldFire seed={4} scale={1.4} /></State>
              <State label="a smaller one"><FieldFire seed={7} /></State>
              <State label="factory flame"><FactoryFlame /></State>
              <State label="ghost dot"><GhostDot /></State>
            </div>
          </div>
        </Pane>
        <Pane theme="night" tag="night · trays">
          <div className="kit-states">
            <State label="empty"><Tray label={L["sort.tray.field"]} /></State>
            <State label="lit, with a fire"><Tray label={L["sort.tray.not"]} lit><FactoryFlame /></Tray></State>
          </div>
        </Pane>
      </Row>

      <Row eyebrow="the table is the hero" title="The fire diary" note="From the record: raw MODIS and VIIRS as they were joined, then one diary with every translated year and its doubt band.">
        <Pane theme="night" wide tag="night · the desk">
          <div className="kit-desk">
            <WoodCanvas className="kit-wood" />
            <DiaryBook title={L["ui.diary"]} bars={raw} max={max} label="The seasons as recorded" />
            <DiaryBook title={L["ui.diary"]} bars={one} max={max} bands label="The seasons in one diary" />
          </div>
        </Pane>
      </Row>

      <Row eyebrow="level four" title="The translator" note="An alidade over a how-close scale, a × dial, a crank, four gear seats and a lantern window whose flame grows as it gets closer. No face.">
        <Pane theme="night">
          <div className="kit-states">
            <State label="raw, far off"><Translator closeness={closeness(data.needle.raw)} labels={scale} k={1} /></State>
            <State label="at its magic number"><Translator closeness={closeness(data.needle.M0)} labels={scale} k={data.magic} dialAngle={data.magic * 18} /></State>
            <State label="all four gears in"><Translator closeness={closeness(data.needle.M4)} labels={scale} k={data.magic} seats={[1, 2, 3, 4]} crankAngle={90} /></State>
          </div>
        </Pane>
        <Pane theme="folio" tag="folio · the gears">
          <div className="kit-states">
            <State label={L["t44.g1"]}><Gear idea={1} /></State>
            <State label={L["t44.g2"]}><Gear idea={2} /></State>
            <State label={L["t44.g3"]}><Gear idea={3} /></State>
            <State label={L["t44.g4"]}><Gear idea={4} /></State>
            <State label="the balance"><Balance tip={-8} /></State>
            <State label="the volvelle"><Volvelle months={months} turn={9} /></State>
            <State label="two fires"><TwoFires /></State>
            <State label="the year lever"><YearLever at={0.7} /></State>
          </div>
        </Pane>
      </Row>

      <Row eyebrow="the desk" title="Seals, slips and the envelope">
        <Pane theme="night">
          <div className="kit-states">
            <State label={L["t45.seal"]}><WaxSeal kind="honest" /></State>
            <State label={L["c56.seal"]}><WaxSeal kind="detective" /></State>
            <State label={L["end.seal"]}><WaxSeal kind="keeper" /></State>
            <State label="the reading stone"><ReadingStone /></State>
          </div>
        </Pane>
        <Pane theme="night" tag="night · before and after">
          <div className="kit-states">
            <State label="the rumour"><RumourSlip text={L["t41.rumour"]} /></State>
            <State label="false, inked over"><RumourSlip text={L["t41.rumour"]} struck stamp={L["t41.false"]} /></State>
            <State label="sealed"><Envelope label={L["t45.envelope"]} /></State>
            <State label="opened"><Envelope label={L["t45.envelope"]} open /></State>
          </div>
        </Pane>
      </Row>

      <Row eyebrow="level five" title="Who needs the diary" note="Engraved figures on wooden tokens: examples, not real users.">
        <Pane theme="night">
          <div className="kit-states">
            {([1, 2, 3, 4, 5] as const).map((i) => <PersonToken key={i} who={i} label={L[`c56.p${i}`]} />)}
          </div>
        </Pane>
        <Pane theme="folio">
          <div className="kit-states">
            {([1, 2, 3] as const).map((i) => <PersonToken key={i} who={i} label={L[`c56.p${i}`]} />)}
          </div>
        </Pane>
      </Row>

      <Row eyebrow="stars in the sky" title="The hoopoe constellation" note="Three stars a level, fifteen in all, joined by brass thread at the end. A hint dims a star.">
        <Pane theme="night">
          <div className="kit-states">
            <State label="after two levels"><Constellation lit={lit(6)} /></State>
            <State label="all fifteen, threaded"><Constellation lit={lit(15).map(() => "on")} threaded /></State>
          </div>
        </Pane>
        <Pane theme="night" tag="night · the sky">
          <div className="kit-skybox"><SkyCanvas className="kit-sky" /></div>
        </Pane>
      </Row>

      <Row eyebrow="bonus parts" title="The clock and the globe" note="The clock is an illustration of passes by day and night, with no figures. The globe's land and pins are from the data.">
        <Pane theme="night">
          <div className="kit-states">
            <State label="a fire caught"><PassClock passes={[1.5, 10.5, 13.5, 22.5]} fire={{ from: 12.5, to: 15, caught: true }} labels={{ day: L["c54.day"], night: L["c54.night"] }} /></State>
            <State label="a fire missed"><PassClock passes={[1.5, 10.5, 13.5, 22.5]} fire={{ from: 16, to: 19, caught: false }} labels={{ day: L["c54.day"], night: L["c54.night"] }} /></State>
          </div>
          <IllusTag text={L["ui.illus"]} />
        </Pane>
        <Pane theme="night" tag="night · the globe">
          <Globe size={data.globe.size} land={data.globe.land} graticule={data.globe.graticule}>
            {data.globe.pins.map((p) => (
              <span key={p.id} className="kit-pin" style={{ left: `${(p.x / data.globe.size) * 100}%`, top: `${(p.y / data.globe.size) * 100}%` }}>
                <i className="token-disc" /> <span className="kit-pin-word">{L[`c55.${p.id}`]}</span>
              </span>
            ))}
          </Globe>
        </Pane>
      </Row>
    </main>
  );
}

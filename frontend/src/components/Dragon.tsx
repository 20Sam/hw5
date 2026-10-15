import { useId } from 'react'
import type { CSSProperties } from 'react'
import { AGENTS } from '../agents'
import type { Mood } from '../agents'
import type { Role } from '../types'

/* The flight-deck crew: five dragons surfing hoverboards, drawn in SVG code (no images).
   Colour + gear say who is who; the pose says how they're doing (see .dragon rules in styles.css). */

interface Palette {
  rim: string
  aura: string
  body: string
  belly: string
  wing: string
  horn: string
  accent: string
  board: string
  flame: string
}

const PALETTE: Record<Role, Palette> = {
  boss: { rim: '#f5c86c', aura: 'rgba(245, 200, 108, 0.75)', body: '#2c6fa3', belly: '#cdeceb', wing: '#3d8bc4', horn: '#f5c86c', accent: '#e3a345', board: '#e3a345', flame: '#f36f5e' },
  inventory: { rim: '#c9eadf', aura: 'rgba(155, 199, 199, 0.6)', body: '#5aa391', belly: '#e1f3eb', wing: '#468c7c', horn: '#ece0c8', accent: '#9bc7c7', board: '#3b4a85', flame: '#9bc7c7' },
  accounting: { rim: '#fde7ae', aura: 'rgba(245, 200, 108, 0.6)', body: '#d29a35', belly: '#f8e8c6', wing: '#b07b2e', horn: '#fbf8f1', accent: '#27325a', board: '#3b4a85', flame: '#f5c86c' },
  facilities: { rim: '#f8c3b2', aura: 'rgba(243, 111, 94, 0.55)', body: '#c25a4a', belly: '#f6d7c4', wing: '#a2473a', horn: '#f5c86c', accent: '#f5c86c', board: '#3b4a85', flame: '#e3a345' },
  customer_service: { rim: '#ffd6cb', aura: 'rgba(243, 111, 94, 0.6)', body: '#f07a69', belly: '#fff0e9', wing: '#d55a4b', horn: '#fbf8f1', accent: '#9bc7c7', board: '#2a6177', flame: '#f6b8a8' },
}

// Each dragon bobs on its own beat so the crew never moves in lockstep.
const PHASE: Record<Role, number> = { boss: 0, inventory: -0.8, accounting: -1.9, facilities: -2.6, customer_service: -1.3 }

const LENS = 'M106 41 L126 39.5 Q128.6 40.6 127.6 44 Q125.6 50.6 117.6 50.6 Q109 50.6 107 45.6 Z'

export function Dragon({ role, mood = 'idle', badge = false, roar = false }: { role: Role; mood?: Mood; badge?: boolean; roar?: boolean }) {
  const p = PALETTE[role]
  const uid = useId().replace(/:/g, '')
  const meta = AGENTS[role]
  const style = {
    '--d-rim': p.rim,
    '--d-aura': p.aura,
    '--d-body': p.body,
    '--d-belly': p.belly,
    '--d-wing': p.wing,
    '--d-horn': p.horn,
    '--d-accent': p.accent,
    '--d-board': p.board,
    '--d-flame': p.flame,
    '--phase': `${PHASE[role]}s`,
  } as CSSProperties

  return (
    <svg
      className={`dragon dragon-${role} mood-${mood}${badge ? ' badge' : ''}${roar ? ' roaring' : ''}`}
      viewBox={badge ? '86 6 68 62' : '0 0 198 152'}
      style={style}
      role="img"
      aria-label={`${meta.name} dragon (${meta.nick}), ${roar ? 'roaring' : mood}`}
    >
      <defs>
        <clipPath id={`${uid}-lens`}>
          <path d={LENS} />
        </clipPath>
      </defs>
      {!badge && <ellipse className="d-glow" cx="80" cy="146" rx="52" ry="4" />}
      <g className="d-float">
        {!badge && (
          <g className="d-ride">
            <path className="d-flame" d="M36 137 Q40 150 44 137 Z" />
            <path className="d-flame d-flame-2" d="M116 137 Q120 152 124 137 Z" />
            <path className="d-board" d="M22 127 Q14 127 16 132 Q18 137 28 137 L134 137 Q144 137 145 132 Q146 127 138 127 Z" />
            <path className="d-board-stripe" d="M30 131.5 L132 131.5" />
            <circle className="d-board-light" cx="138" cy="131.5" r="1.8" />
          </g>
        )}
        {role === 'inventory' && !badge && (
          <g className="d-crate">
            <rect x="24" y="112" width="17" height="15" rx="1.5" />
            <path d="M24 119.5 H41 M32.5 112 V127" />
          </g>
        )}
        <g className="d-tail">
          <path className="d-skin" d="M58 104 C42 108 28 104 20 94 C16 88 18 82 24 80 C23 88 30 96 42 98 C48 99 53 99 57 98 Z" />
          <path className="d-horn-fill" d="M24 80 L13 75 L19 87 Z" />
        </g>
        <g className="d-wing d-wing-back">
          <path d="M80 74 C70 52 52 40 34 38 C42 46 44 52 40 58 C50 58 56 62 58 70 C64 66 72 68 80 74 Z" />
        </g>
        {role === 'boss' && (
          <g className="d-scarf">
            <path d="M104 65 C92 61 80 65 70 61 C62 58 54 61 46 57 C54 65 64 69 76 70 C88 71 96 71 104 71 Z" />
            <path d="M60 63 C52 69 45 71 37 69 C45 74 53 74 61 69 Z" />
          </g>
        )}
        <path className="d-leg" d="M64 109 L58 126" />
        <path className="d-leg" d="M93 111 L101 126" />
        <ellipse className="d-foot" cx="57" cy="126.5" rx="6.5" ry="2.6" />
        <ellipse className="d-foot" cx="103" cy="126.5" rx="6.5" ry="2.6" />
        <path className="d-skin" d="M54 108 C48 88 60 70 82 68 C102 66 112 80 108 98 C105 112 92 118 78 117 C66 116 57 114 54 108 Z" />
        <path className="d-belly" d="M74 112 C70 100 76 82 92 78 C100 84 102 98 96 108 C90 114 80 116 74 112 Z" />
        <path className="d-scales" d="M78 107 Q87 103 96 101 M79 99 Q88 95 98 93 M83 91 Q90 87 98 85" />
        <path className="d-skin" d="M89 83 C93 71 98 62 104 56 L114 58 C109 66 105 75 103 85 Z" />
        <path className="d-horn-fill d-spike" d="M90 74 L84 70 L92 69 Z M95 65 L89 60 L97 60 Z M101 57 L96 51 L104 52 Z" />
        <g className="d-wing d-wing-front">
          <path d="M86 76 C80 50 64 34 46 28 C54 38 56 46 52 52 C62 52 68 58 70 66 C76 64 82 68 86 76 Z" />
          <path className="d-membrane" d="M84 72 C74 54 62 42 50 34 M80 72 C71 61 63 55 55 51" />
        </g>
        {role === 'boss' && <path className="d-badge-star" d="M86 90 L87.8 94.2 L92.3 94.5 L88.8 97.4 L89.9 101.8 L86 99.4 L82.1 101.8 L83.2 97.4 L79.7 94.5 L84.2 94.2 Z" />}
        <path className="d-arm" d="M98 92 Q106 96 110 102" />
        <circle className="d-hand" cx="111" cy="103" r="3.4" />
        {role === 'accounting' && (
          <g className="d-coin">
            <ellipse cx="113" cy="88" rx="5" ry="5" />
            <path d="M113 85 V91" />
          </g>
        )}
        {role === 'facilities' && (
          <g className="d-keys">
            <circle cx="112" cy="108" r="3.6" />
            <path d="M110 111 L107 119 M107 116 L104 116 M114 111 L117 118 M117 115 L120 115" />
          </g>
        )}
        <g className="d-head">
          <path className="d-horn-fill" d="M106 38 C100 28 96 24 88 22 C96 28 100 34 102 40 Z" />
          <path className="d-horn-fill" d="M113 35 C111 24 108 18 102 14 C108 22 110 30 109 37 Z" />
          <path className="d-skin" d="M100 50 C100 38 112 32 124 35 C134 37 146 42 148 50 C149 56 142 60 132 60 C122 61 112 62 104 60 C100 58 100 54 100 50 Z" />
          <path className="d-jaw" d="M120 56 Q132 58.5 145 52" />
          <g className="d-mouth">
            <path className="d-mouth-in" d="M121 55 L148 49 L147.5 60 Q134 67 121 57 Z" />
            <path className="d-tooth" d="M128 53.5 L130 57 L132 52.8 Z M137 51.6 L139 55.2 L141 51 Z M130 61.6 L132 58.6 L134 62.2 Z M139 60 L141 57.2 L143 60.4 Z" />
          </g>
          <ellipse className="d-nostril" cx="142" cy="46" rx="1.7" ry="1" />
          <g className="d-eye">
            <circle className="d-sclera" cx="117" cy="44" r="4.3" />
            <circle className="d-pupil" cx="118.6" cy="44.3" r="2.5" />
            <circle className="d-shine" cx="119.4" cy="43.3" r="0.8" />
          </g>
          <path className="d-happy" d="M112.5 45.5 Q117 40.5 121.5 45.5" />
          <path className="d-brow" d="M111 38.6 L123.5 36.8" />
          {role === 'boss' && (
            <g className="d-shades">
              <path className="d-temple" d="M107 42.5 L99 43.5" />
              <path className="d-lens" d={LENS} />
              <g clipPath={`url(#${uid}-lens)`}>
                <rect className="d-glint" x="100" y="34" width="4" height="22" />
              </g>
            </g>
          )}
          {role === 'inventory' && (
            <g className="d-goggles">
              <path d="M101 41 Q111 29 125 33" />
              <circle cx="120.5" cy="33.5" r="4.6" />
            </g>
          )}
          {role === 'accounting' && (
            <g className="d-monocle">
              <circle cx="117" cy="44" r="6.6" />
              <path d="M117 50.6 Q114 62 105 70" />
            </g>
          )}
          {role === 'facilities' && (
            <g className="d-hat">
              <path d="M102 39.5 Q104 27 116.5 27 Q129 27 131 37.5 Z" />
              <path className="d-hat-brim" d="M99 40 L134 37.6" />
            </g>
          )}
          {role === 'customer_service' && (
            <g className="d-headset">
              <path d="M104 42 Q110 25 125 31" />
              <circle cx="106" cy="44.5" r="4.2" />
              <path className="d-mic" d="M107 48.5 Q114 58.5 128 56.5" />
              <circle cx="129.2" cy="56.4" r="1.9" />
            </g>
          )}
        </g>
        {!badge && (
          <g className="d-fire">
            <path className="d-fire-outer" d="M147 54 C160 42 178 40 197 47 C184 51 184 58 197 63 C178 68 160 66 147 57 Z" />
            <path className="d-fire-mid" d="M147 54.5 C158 47 171 46 186 50 C176 53 176 57 186 60 C171 63 158 62 147 56.5 Z" />
            <path className="d-fire-core" d="M147 55 C155 51 163 51 173 53 C166 54.5 166 56 173 57.5 C163 59.5 155 59 147 56 Z" />
            <circle className="d-spark" cx="182" cy="42" r="1.4" />
            <circle className="d-spark d-spark-2" cx="190" cy="66" r="1.2" />
            <circle className="d-spark d-spark-3" cx="175" cy="70" r="1" />
          </g>
        )}
        {!badge && (
          <g className="d-shock">
            <circle cx="150" cy="54" r="10" />
            <circle className="d-shock-2" cx="150" cy="54" r="10" />
          </g>
        )}
        {role === 'customer_service' && !badge && (
          <path className="d-holo-heart" d="M136 24 C136 20 141 19 142 23 C143 19 148 20 148 24 C148 28 142 31 142 33 C142 31 136 28 136 24 Z" />
        )}
        {mood === 'thinking' && (
          <g className="d-think">
            <circle cx="130" cy="24" r="2" />
            <circle cx="138" cy="17" r="2.7" />
            <circle cx="147" cy="10" r="3.4" />
          </g>
        )}
        {mood === 'error' && !badge && (
          <g className="d-smoke">
            <circle cx="40" cy="122" r="5" />
            <circle cx="33" cy="114" r="4" />
            <circle cx="44" cy="108" r="3.2" />
          </g>
        )}
      </g>
    </svg>
  )
}

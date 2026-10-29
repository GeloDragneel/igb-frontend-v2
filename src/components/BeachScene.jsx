/* ---------- Summer: a beach at the bottom of the sidebar ----------
   sea with rolling waves + a sailboat · a swimmer on a float ring · sand with foam at the shore
   a palm tree · a striped umbrella with someone sunbathing on a towel · a kid with a bouncing beach ball
   a sandcastle · a surfboard · shells. Only transform / opacity move (light on the browser). */
const BeachScene = () => (
    <svg className="sn-beach-scene" viewBox="0 0 260 200" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <defs>
            <linearGradient id="snSea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#38bdf8" />
                <stop offset="1" stopColor="#0284c7" />
            </linearGradient>
            <linearGradient id="snSand" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fde68a" />
                <stop offset="1" stopColor="#f5c46b" />
            </linearGradient>
        </defs>

        {/* sea */}
        <rect x="0" y="62" width="260" height="80" fill="url(#snSea)" />
        <g className="sn-bs-boat">
            <path d="M196 66h22l-3 5h-16z" fill="#fff" />
            <path d="M207 44v22" stroke="#334155" strokeWidth="1.2" />
            <path d="M208 46l10 17h-10z" fill="#fff" />
            <path d="M206 49l-8 14h8z" fill="#fb923c" />
        </g>
        <g className="sn-bs-waves">
            <path d="M-60 80q10-5 20 0t20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0" stroke="#bae6fd" strokeWidth="1.6" fill="none" opacity=".8" />
            <path d="M-50 96q10-5 20 0t20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0" stroke="#e0f2fe" strokeWidth="1.6" fill="none" opacity=".7" />
        </g>
        {/* swimmer on a float ring */}
        <g className="sn-bs-swim">
            <ellipse cx="62" cy="108" rx="11" ry="4.5" fill="none" stroke="#f472b6" strokeWidth="4" />
            <circle cx="62" cy="100" r="4.5" fill="#f1c27d" />
            <path d="M57.5 98.5a4.6 4.6 0 0 1 9 0z" fill="#1f2937" />
            <path d="M55 104l-5-6M69 104l5-6" stroke="#f1c27d" strokeWidth="2" strokeLinecap="round" />
        </g>

        {/* sand + foam */}
        <path d="M0 132c40-10 90-14 140-8s90 2 120-6v82H0z" fill="url(#snSand)" />
        <path className="sn-bs-foam" d="M0 132c40-10 90-14 140-8s90 2 120-6" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".9" />
        <path d="M20 168h6M70 182h8M120 160h5M200 176h7M236 190h6" stroke="#e7b75f" strokeWidth="1.4" strokeLinecap="round" />

        {/* surfboard stuck in the sand */}
        <g transform="rotate(-12 228 150)">
            <ellipse cx="228" cy="150" rx="6" ry="24" fill="#22d3ee" />
            <path d="M228 128v44" stroke="#0e7490" strokeWidth="1.4" />
        </g>

        {/* umbrella + towel + sunbather */}
        <g>
            <path d="M150 104v70" stroke="#475569" strokeWidth="2" />
            <path d="M116 122Q150 84 184 122z" fill="#ef4444" />
            <path d="M150 99L128 122h11zM150 99L161 122h11z" fill="#fff" />
            <path d="M116 122q8.5-5 17 0q8.5-5 17 0q8.5-5 17 0q8.5-5 17 0" fill="none" stroke="#b91c1c" strokeWidth="1.2" />
            <circle cx="150" cy="99" r="2" fill="#475569" />
            <g transform="translate(14 0)">
                <rect x="118" y="170" width="52" height="11" rx="2" fill="#3b82f6" transform="skewX(-12)" />
                {/* person lying down */}
                <circle cx="104" cy="171" r="5" fill="#e0ac69" />
                <path d="M100 167a5 5 0 0 1 8 1z" fill="#78350f" />
                <rect x="108" y="168" width="22" height="7" rx="3.5" fill="#e0ac69" />
                <rect x="112" y="168" width="8" height="7" rx="2" fill="#f43f5e" />
                <path d="M130 171.5h12" stroke="#e0ac69" strokeWidth="5" strokeLinecap="round" />
                <path d="M100 168h7" stroke="#111827" strokeWidth="2" strokeLinecap="round" />
            </g>
        </g>

        {/* kid + beach ball */}
        <g>
            <circle cx="196" cy="147" r="5" fill="#c68642" />
            <path d="M191.5 145a5 5 0 0 1 9 0z" fill="#111827" />
            <path d="M190 153h12l-1 12h-10z" fill="#facc15" />
            <path d="M192 165v10M200 165v10" stroke="#c68642" strokeWidth="3" strokeLinecap="round" />
            <path d="M190 155l-6-8M202 155l6-8" stroke="#c68642" strokeWidth="2.6" strokeLinecap="round" />
        </g>
        <g className="sn-bs-ball">
            <circle cx="196" cy="126" r="7" fill="#fff" />
            <path d="M196 119a7 7 0 0 1 6.6 4.6L196 126z" fill="#ef4444" />
            <path d="M189.4 128.4A7 7 0 0 1 190 122L196 126z" fill="#3b82f6" />
            <path d="M201 131a7 7 0 0 1-8 1.6L196 126z" fill="#facc15" />
        </g>

        {/* sandcastle */}
        <g fill="#eab364">
            <rect x="62" y="174" width="28" height="14" />
            <rect x="67" y="165" width="18" height="9" />
            <path d="M62 174h3.5v-3.5h3.5v3.5h3.5v-3.5h3.5v3.5h3.5v-3.5h3.5v3.5h3.5v-3.5h3.5v3.5" />
            <rect x="73" y="158" width="6" height="7" />
        </g>
        <path d="M76 158v-10" stroke="#475569" strokeWidth="1" />
        <path className="sn-bs-flag" d="M76 148l8 3-8 3z" fill="#ef4444" />

        {/* shells */}
        <path d="M86 190a5 5 0 0 1 10 0z" fill="#fda4af" />
        <path d="M244 166a4 4 0 0 1 8 0z" fill="#fdba74" />
    </svg>
);
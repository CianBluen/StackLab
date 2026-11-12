export const Logo = () => (
  <div className="relative flex h-[34px] w-[34px] items-center justify-center overflow-hidden rounded-[9px] border border-[#2d4562] bg-[#0c1725] shadow-[0_0_24px_-10px_rgba(77,157,255,.9),inset_0_1px_0_rgba(255,255,255,.08)]">
    <svg viewBox="0 0 34 34" className="h-[25px] w-[25px]" aria-hidden="true">
      <defs>
        <linearGradient id="logo-blue" x1="5" y1="7" x2="29" y2="27" gradientUnits="userSpaceOnUse">
          <stop stopColor="#77c4ff" />
          <stop offset="0.55" stopColor="#3f93f0" />
          <stop offset="1" stopColor="#3bd9ae" />
        </linearGradient>
        <linearGradient id="logo-violet" x1="4" y1="4" x2="29" y2="16" gradientUnits="userSpaceOnUse">
          <stop stopColor="#c5a8ff" />
          <stop offset="1" stopColor="#8b6cf0" />
        </linearGradient>
      </defs>
      <path
        d="M8.3 8.2h17.4M8.3 15.1h17.4M8.3 22h17.4"
        stroke="#1f3a58"
        strokeWidth="5.2"
        strokeLinecap="round"
      />
      <path
        d="M8.1 8.2h10.2M8.1 15.1h15.9M8.1 22h8.4"
        stroke="url(#logo-blue)"
        strokeWidth="3.1"
        strokeLinecap="round"
      />
      <path d="M6.5 6.8v21.4" stroke="url(#logo-violet)" strokeWidth="1.15" strokeLinecap="round" />
      <path d="M28 6.8v21.4" stroke="url(#logo-violet)" strokeWidth="1.15" strokeLinecap="round" opacity="0.6" />
      <circle cx="25.8" cy="15.1" r="2.5" fill="#37d99b" stroke="#07101b" strokeWidth="1.2" />
    </svg>
  </div>
)

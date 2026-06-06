type Props = {
  size?: number
  className?: string
}

export default function Logo({ size = 40, className = '' }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@1,500&display=swap');
        `}</style>
      </defs>
      <rect width="100" height="100" rx="22" fill="#141414" />
      {/* "di" — lighter, smaller */}
      <text
        x="19"
        y="60"
        fontFamily="Lora, Georgia, 'Times New Roman', serif"
        fontStyle="italic"
        fontWeight="400"
        fontSize="26"
        fill="rgba(255,255,255,0.65)"
        letterSpacing="-0.5"
      >
        di
      </text>
      {/* "ARI" — bolder, larger */}
      <text
        x="45"
        y="62"
        fontFamily="Lora, Georgia, 'Times New Roman', serif"
        fontStyle="italic"
        fontWeight="600"
        fontSize="30"
        fill="white"
        letterSpacing="-1"
      >
        ARI
      </text>
    </svg>
  )
}

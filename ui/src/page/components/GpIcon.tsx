interface GpIconProps {
  bg: string;
  fg: string;
}

const GpIcon = ({ bg, fg }: GpIconProps) => (
  <svg
    className="gp-icon"
    width="16"
    height="16"
    viewBox="0 0 16 16"
    aria-hidden="true"
  >
    <circle cx="8" cy="8" r="8" fill={bg} />
    <rect x="4.1" y="7.2" width="1.9" height="4.6" rx="0.6" fill={fg} />
    <rect x="7.05" y="4.6" width="1.9" height="7.2" rx="0.6" fill={fg} />
    <rect x="10" y="6.2" width="1.9" height="5.6" rx="0.6" fill={fg} />
  </svg>
);

export default GpIcon;

interface CatAstronautLoaderProps {
  label: string;
  variant?: 'page' | 'overlay';
}

const CatAstronautLoader = ({
  label,
  variant = 'page',
}: CatAstronautLoaderProps) => {
  const text = label.replace(/\s*(…|\.\.\.)$/, '') || label;

  return (
    <div
      className={`cat-loader cat-loader--${variant}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="cat-loader-panel">
        <div className="cat-loader-art" aria-hidden="true">
          <img
            className="cat-loader-image"
            src={`${import.meta.env.BASE_URL}cat-astronaut-loader.png`}
            alt=""
            draggable={false}
            decoding="async"
            fetchPriority="high"
          />

          <span className="cat-loader-planets">
            <span className="cat-loader-orbit-ring cat-loader-orbit-ring--a">
              <span className="cat-loader-planet cat-loader-planet--a" />
            </span>
            <span className="cat-loader-orbit-ring cat-loader-orbit-ring--b">
              <span className="cat-loader-planet cat-loader-planet--b" />
            </span>
            <span className="cat-loader-orbit-ring cat-loader-orbit-ring--c">
              <span className="cat-loader-planet cat-loader-planet--c" />
            </span>
            <span className="cat-loader-orbit-ring cat-loader-orbit-ring--d">
              <span className="cat-loader-planet cat-loader-planet--d" />
            </span>
          </span>
        </div>

        <div className="cat-loader-copy">
          <span className="cat-loader-text">{text}</span>
          <span className="cat-loader-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>
      </div>
    </div>
  );
};

export default CatAstronautLoader;

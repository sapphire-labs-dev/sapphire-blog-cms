import icon from '../assets/icon.webp';

/** Project name, in a single place. */
export const BRAND = 'Sapphire Blog CMS';

export const ICON_URL = icon;

/** The sapphire icon. */
export function Logo({ size = 28 }: { size?: number }) {
  return <img className="scms-logo" src={icon} width={size} height={size} alt="" draggable={false} />;
}

/** The sapphire with "Sapphire" and "BLOG CMS", like the Sapphire Labs site. Text, so it follows the theme. */
export function Wordmark() {
  return (
    <span className="scms-wordmark" role="img" aria-label={BRAND}>
      <Logo size={36} />
      <span className="scms-wordmark__text" aria-hidden="true">
        Sapphire <b>Blog CMS</b>
      </span>
    </span>
  );
}

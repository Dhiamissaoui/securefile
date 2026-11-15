import { initials } from '../lib/format';

export default function Avatar({ name = '', size = 'md', tone = 'mint' }) {
  return (
    <span className={`avatar avatar--${size} avatar--${tone}`} aria-hidden="true">
      {initials(name) || '?'}
    </span>
  );
}

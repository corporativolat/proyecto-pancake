import { userInitials, avatarClass } from '../lib/utils';

export default function Avatar({ user, size = 40, className = '' }) {
  if (!user) {
    return (
      <div className={`rounded-full bg-ink-200 text-ink-500 flex items-center justify-center font-bold ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.32 }}>?</div>
    );
  }
  if (user.avatar_url) {
    return (
      <img src={user.avatar_url} alt={user.name}
        className={`rounded-full object-cover shadow-md ${className}`}
        style={{ width: size, height: size }} />
    );
  }
  return (
    <div className={`rounded-full text-white flex items-center justify-center font-bold shadow-sm ${avatarClass(user.avatar)} ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.32 }}>
      {userInitials(user.name)}
    </div>
  );
}

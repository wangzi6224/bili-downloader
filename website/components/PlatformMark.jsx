import { siApple, siLinux } from 'simple-icons';

const brandMarks = {
  mac: siApple,
  linux: siLinux,
};

function WindowsMark() {
  return (
    <svg aria-hidden="true" className="platform-mark" focusable="false" viewBox="0 0 24 24">
      <path d="M1.5 4.2 10.4 3v8.1H1.5zm10.6-1.5L22.5 1v10.1H12.1zM1.5 12.9h8.9V21l-8.9-1.2zm10.6 0h10.4V23l-10.4-1.5z" fill="currentColor" />
    </svg>
  );
}

export default function PlatformMark({ platform }) {
  if (platform === 'windows') return <WindowsMark />;

  const mark = brandMarks[platform];
  if (!mark) return null;

  return (
    <svg aria-hidden="true" className="platform-mark" focusable="false" viewBox="0 0 24 24">
      <path d={mark.path} fill="currentColor" />
    </svg>
  );
}

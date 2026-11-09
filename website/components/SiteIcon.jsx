import {
  AudioLines,
  Bookmark,
  BookOpenText,
  Captions,
  Check,
  CirclePause,
  Clapperboard,
  Download,
  FileVideo,
  Folder,
  Image,
  LaptopMinimal,
  Layers3,
  Link2,
  ListVideo,
  MessageSquare,
  Monitor,
  PanelsTopLeft,
  Plus,
  Rss,
  Search,
  SlidersHorizontal,
  Terminal,
  UserRound,
  Video,
  Workflow,
} from 'lucide-react';
import { MarkGithubIcon } from '@primer/octicons-react';

const iconSet = {
  audio: AudioLines,
  bookmark: Bookmark,
  book: BookOpenText,
  captions: Captions,
  check: Check,
  clapperboard: Clapperboard,
  download: Download,
  file: FileVideo,
  folder: Folder,
  image: Image,
  mac: LaptopMinimal,
  layers: Layers3,
  link: Link2,
  listVideo: ListVideo,
  message: MessageSquare,
  monitor: Monitor,
  plus: Plus,
  pause: CirclePause,
  rss: Rss,
  search: Search,
  sliders: SlidersHorizontal,
  terminal: Terminal,
  user: UserRound,
  video: Video,
  windows: PanelsTopLeft,
  workflow: Workflow,
  github: MarkGithubIcon,
};

export default function SiteIcon({ name, size = 18, strokeWidth = 1.9, className = '' }) {
  const Icon = iconSet[name];
  if (!Icon) return null;

  return (
    <Icon
      aria-hidden="true"
      className={`site-icon ${className}`.trim()}
      focusable="false"
      size={size}
      strokeWidth={strokeWidth}
    />
  );
}

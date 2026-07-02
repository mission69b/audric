// Single icon surface for the app. Two things live here:
//
//  1. `AudricMark` — the brand diamond (a 3-3-3 grid of rounded squares). Ported
//     rect-for-rect from the prototype's inline SVG (viewBox 0 0 53 53) so the
//     logo is pixel-identical to web-v3 / the mobile prototype.
//  2. A curated re-export of lucide-react-native icons — the SAME icon family the
//     prototype draws with (its inline SVGs are lucide paths). lucide + svg both
//     ship in Expo Go, so these render with no dev build. Import chrome icons from
//     here, never from lucide directly, so the set stays auditable in one place.

import Svg, { Path, Rect } from "react-native-svg";

export function AudricMark({
  size = 24,
  color = "#000",
}: {
  size?: number;
  color?: string;
}) {
  // 9 squares on a 53×53 grid — the Audric mark.
  const cells: [number, number][] = [
    [22, 0],
    [11, 11],
    [33, 11],
    [0, 22],
    [22, 22],
    [44, 22],
    [11, 33],
    [33, 33],
    [22, 44],
  ];
  return (
    <Svg width={size} height={size} viewBox="0 0 53 53">
      {cells.map(([x, y]) => (
        <Rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width={9}
          height={9}
          rx={2}
          fill={color}
        />
      ))}
    </Svg>
  );
}

// The multi-colour Google "G" (sign-in buttons). Ported from the prototype's
// inline brand SVG — fixed brand colours, so it ignores the icon `color` prop.
export function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
        fill="#4285F4"
      />
      <Path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
        fill="#34A853"
      />
      <Path
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
        fill="#FBBC05"
      />
      <Path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
        fill="#EA4335"
      />
    </Svg>
  );
}

export {
  ArrowDown,
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Bell,
  Brain,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  Circle,
  Coins,
  Copy,
  CreditCard,
  Download,
  Ellipsis,
  Eraser,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Fingerprint,
  Gift,
  GitCompare,
  Globe,
  HelpCircle,
  Image as ImageIcon,
  Info,
  KeyRound,
  List,
  Loader,
  Lock,
  LogIn,
  LogOut,
  Maximize2,
  MessageSquare,
  MessageSquarePlus,
  Moon,
  PanelLeft,
  Paperclip,
  Palette,
  Pencil,
  Play,
  Plus,
  QrCode,
  Redo2,
  RefreshCw,
  ScanFace,
  Search,
  Settings,
  Share2,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Sparkle,
  Sparkles,
  SquareArrowOutUpRight,
  SquarePen,
  Sun,
  TextAlignStart,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  TriangleAlert,
  Undo2,
  Unplug,
  Users,
  Wallet,
  WandSparkles,
  Wrench,
  X,
  Zap,
} from "lucide-react-native";

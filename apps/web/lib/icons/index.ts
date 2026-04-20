import type { ComponentType, SVGProps } from 'react';
import { ActivityIcon } from './ActivityIcon';
import { AnalyticsIcon } from './AnalyticsIcon';
import { ArrowDownIcon } from './ArrowDownIcon';
import { ArrowLeftIcon } from './ArrowLeftIcon';
import { ArrowRightIcon } from './ArrowRightIcon';
import { ArrowUpIcon } from './ArrowUpIcon';
import { BellIcon } from './BellIcon';
import { BotIcon } from './BotIcon';
import { ChartLineIcon } from './ChartLineIcon';
import { ChatIcon } from './ChatIcon';
import { CheckIcon } from './CheckIcon';
import { ChevronDownIcon } from './ChevronDownIcon';
import { ChevronLeftIcon } from './ChevronLeftIcon';
import { ChevronRightIcon } from './ChevronRightIcon';
import { ChevronUpIcon } from './ChevronUpIcon';
import { CloseIcon } from './CloseIcon';
import { ContactsIcon } from './ContactsIcon';
import { CopyIcon } from './CopyIcon';
import { DashboardIcon } from './DashboardIcon';
import { DrawerIcon } from './DrawerIcon';
import { ExternalLinkIcon } from './ExternalLinkIcon';
import { FilterIcon } from './FilterIcon';
import { GoalsIcon } from './GoalsIcon';
import { LinkIcon } from './LinkIcon';
import { MailIcon } from './MailIcon';
import { MicrophoneIcon } from './MicrophoneIcon';
import { MonitorIcon } from './MonitorIcon';
import { MoonIcon } from './MoonIcon';
import { PanelLeftIcon } from './PanelLeftIcon';
import { PauseIcon } from './PauseIcon';
import { PayIcon } from './PayIcon';
import { PlayIcon } from './PlayIcon';
import { PlusIcon } from './PlusIcon';
import { PortfolioIcon } from './PortfolioIcon';
import { RocketIcon } from './RocketIcon';
import { SearchIcon } from './SearchIcon';
import { SettingsIcon } from './SettingsIcon';
import { ShieldIcon } from './ShieldIcon';
import { SparkleIcon } from './SparkleIcon';
import { SpinnerIcon } from './SpinnerIcon';
import { StoreIcon } from './StoreIcon';
import { SunIcon } from './SunIcon';

export type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export const ICONS = {
  'activity': ActivityIcon,
  'analytics': AnalyticsIcon,
  'arrow-down': ArrowDownIcon,
  'arrow-left': ArrowLeftIcon,
  'arrow-right': ArrowRightIcon,
  'arrow-up': ArrowUpIcon,
  'bell': BellIcon,
  'bot': BotIcon,
  'chart-line': ChartLineIcon,
  'chat': ChatIcon,
  'check': CheckIcon,
  'chevron-down': ChevronDownIcon,
  'chevron-left': ChevronLeftIcon,
  'chevron-right': ChevronRightIcon,
  'chevron-up': ChevronUpIcon,
  'close': CloseIcon,
  'contacts': ContactsIcon,
  'copy': CopyIcon,
  'dashboard': DashboardIcon,
  'drawer': DrawerIcon,
  'external-link': ExternalLinkIcon,
  'filter': FilterIcon,
  'goals': GoalsIcon,
  'link': LinkIcon,
  'mail': MailIcon,
  'microphone': MicrophoneIcon,
  'monitor': MonitorIcon,
  'moon': MoonIcon,
  'panel-left': PanelLeftIcon,
  'pause': PauseIcon,
  'pay': PayIcon,
  'play': PlayIcon,
  'plus': PlusIcon,
  'portfolio': PortfolioIcon,
  'rocket': RocketIcon,
  'search': SearchIcon,
  'settings': SettingsIcon,
  'shield': ShieldIcon,
  'sparkle': SparkleIcon,
  'spinner': SpinnerIcon,
  'store': StoreIcon,
  'sun': SunIcon,
} as const satisfies Record<string, IconComponent>;

export type IconName = keyof typeof ICONS;

export { ActivityIcon };
export { AnalyticsIcon };
export { ArrowDownIcon };
export { ArrowLeftIcon };
export { ArrowRightIcon };
export { ArrowUpIcon };
export { BellIcon };
export { BotIcon };
export { ChartLineIcon };
export { ChatIcon };
export { CheckIcon };
export { ChevronDownIcon };
export { ChevronLeftIcon };
export { ChevronRightIcon };
export { ChevronUpIcon };
export { CloseIcon };
export { ContactsIcon };
export { CopyIcon };
export { DashboardIcon };
export { DrawerIcon };
export { ExternalLinkIcon };
export { FilterIcon };
export { GoalsIcon };
export { LinkIcon };
export { MailIcon };
export { MicrophoneIcon };
export { MonitorIcon };
export { MoonIcon };
export { PanelLeftIcon };
export { PauseIcon };
export { PayIcon };
export { PlayIcon };
export { PlusIcon };
export { PortfolioIcon };
export { RocketIcon };
export { SearchIcon };
export { SettingsIcon };
export { ShieldIcon };
export { SparkleIcon };
export { SpinnerIcon };
export { StoreIcon };
export { SunIcon };

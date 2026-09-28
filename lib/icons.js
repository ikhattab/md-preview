import {
  createElement,
  createIcons,
  Pencil,
  Eye,
  Link,
  Unlink,
  TriangleAlert,
  ChevronDown,
  ChevronLeft,
  Sun,
  Moon,
  Copy,
  Download,
  Maximize2,
  X,
  CircleCheck,
  Info,
  Lightbulb,
  MessageSquareWarning,
  OctagonAlert,
  Image as ImageIcon,
  ImageOff,
  Ellipsis,
  Upload,
} from 'lucide';

const STATIC_ICONS = {
  Pencil,
  Eye,
  Link,
  Unlink,
  TriangleAlert,
  ChevronDown,
  ChevronLeft,
  Sun,
  Moon,
  X,
  Image: ImageIcon,
  ImageOff,
  Ellipsis,
  Upload,
  Download,
};

/**
 * Create an SVG icon element for dynamic UI (toolbars, lint list, gutter).
 */
export function iconEl(iconNode, attrs = {}) {
  return createElement(iconNode, {
    'aria-hidden': 'true',
    focusable: 'false',
    ...attrs,
  });
}

/** Set accessible name and hover tooltip on an icon button. */
export function labelIconButton(button, label) {
  button.setAttribute('aria-label', label);
  button.title = label;
  button.setAttribute('data-tooltip', label);
}

/**
 * Replace <i data-lucide="..."> placeholders in the document with Lucide SVGs.
 */
export function renderStaticIcons(root = document) {
  createIcons({
    icons: STATIC_ICONS,
    root,
  });
}

export const Icons = {
  Pencil,
  Eye,
  Link,
  Unlink,
  TriangleAlert,
  ChevronDown,
  ChevronLeft,
  Sun,
  Moon,
  Copy,
  Download,
  Maximize2,
  X,
  CircleCheck,
  Info,
  Lightbulb,
  MessageSquareWarning,
  OctagonAlert,
  ImageOff,
};

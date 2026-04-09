import React from 'react';

function makeSvg(children, defaultSize = 18) {
  return function Icon({ size, color } = {}) {
    return (
      <svg width={size || defaultSize} height={size || defaultSize} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    );
  };
}

export const Icons = {
  Search: makeSvg(<React.Fragment><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></React.Fragment>),
  Send: makeSvg(<React.Fragment><path d="m22 2-7 20-4-9-9-4z"/><path d="m22 2-10 10"/></React.Fragment>, 20),
  Menu: makeSvg(<React.Fragment><path d="M4 6h16M4 12h16M4 18h16"/></React.Fragment>, 20),
  Edit: makeSvg(<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>, 14),
  Trash: makeSvg(<React.Fragment><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></React.Fragment>, 14),
  Lock: makeSvg(<React.Fragment><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></React.Fragment>, 14),
  Group: makeSvg(<React.Fragment><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></React.Fragment>, 14),
  Channel: makeSvg(<React.Fragment><path d="M4 9h16M4 15h16M10 3l-2 18M16 3l-2 18"/></React.Fragment>, 14),
  Plus: makeSvg(<path d="M12 5v14M5 12h14"/>, 22),
  Close: makeSvg(<React.Fragment><path d="M18 6 6 18M6 6l12 12"/></React.Fragment>),
  Back: makeSvg(<path d="m15 18-6-6 6-6"/>, 20),
  User: makeSvg(<React.Fragment><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></React.Fragment>),
  Attach: makeSvg(<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>, 20),
  Image: makeSvg(<React.Fragment><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/></React.Fragment>),
  File: makeSvg(<React.Fragment><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></React.Fragment>),
  Mic: makeSvg(<React.Fragment><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v5"/><path d="M8 22h8"/></React.Fragment>, 18),
  Wave: makeSvg(<React.Fragment><path d="M2 12h2"/><path d="M6 9v6"/><path d="M10 6v12"/><path d="M14 8v8"/><path d="M18 5v14"/><path d="M22 10v4"/></React.Fragment>, 16),
  Tag: makeSvg(<React.Fragment><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><circle cx="7.5" cy="7.5" r="1.5" fill="currentColor"/></React.Fragment>, 14),
  Shield: makeSvg(<React.Fragment><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></React.Fragment>, 15),
  Reply: makeSvg(<React.Fragment><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></React.Fragment>, 14),
  Forward: makeSvg(<React.Fragment><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></React.Fragment>, 14),
  Bell: makeSvg(<React.Fragment><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></React.Fragment>),
  BellOff: makeSvg(<React.Fragment><path d="M8.7 3A6 6 0 0 1 18 8c0 2.3.5 4.1 1.1 5.5"/><path d="M3 3l18 18"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="M4 17h12.4"/></React.Fragment>),
  Copy: makeSvg(<React.Fragment><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></React.Fragment>, 14),
  Share: makeSvg(<React.Fragment><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98"/><path d="m15.41 6.51-6.82 3.98"/></React.Fragment>, 16),
  Smile: makeSvg(<React.Fragment><circle cx="12" cy="12" r="10"/><path d="M8 15s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01"/><path d="M15 9h.01"/></React.Fragment>, 16),
  ArrowDown: makeSvg(<path d="m6 9 6 6 6-6"/>, 16),
  Video: makeSvg(<React.Fragment><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></React.Fragment>),
  Logout: makeSvg(<React.Fragment><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></React.Fragment>),
  Check: function CheckIcon({ double, size = 16 }) {
    return (
      <svg width={size} height={12} viewBox="0 0 20 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d={double ? "M1 6l4 4L13 2" : "M4 6l4 4L16 2"} />
        {double && <path d="M6 6l4 4L18 2" />}
      </svg>
    );
  },
};

export const typeColors = { PRIVATE: '#4A9EE5', GROUP: '#7C6BDE', CHANNEL: '#E5884A', SECRET: '#4AE58E' };

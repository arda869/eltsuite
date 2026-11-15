import React from 'react';
import { createRoot } from 'react-dom/client';
import { DownloadMenu } from '../../src/design/Download';
import type { Ctx } from '../../src/design/Editor';

const cx = {
  imgs: {}, view: 'teacher', accent: '#6d5bd0', d: { title: 'Menu check' },
  page: {}, pages: [{}], els: [], learnerUser: true,
} as unknown as Ctx;

createRoot(document.getElementById('root')!).render(
  <div className="dz"><DownloadMenu cx={cx} /><button type="button" id="after-download">Next control</button></div>,
);

import { useEffect, useState } from 'react';
import { Modal } from './ui.jsx';

/* Look at a file without leaving the page.
 *
 * Everything used to be window.open(signedUrl): you lost your place, and on a
 * phone the browser usually downloads rather than displays, so checking "is
 * this the right receipt" meant a download, a file manager and a trip back.
 *
 * PDFs and images cover almost everything a Nigerian back office files, and
 * both render inline from a signed URL. Anything else says so plainly and
 * offers the download rather than showing a broken frame. */

const IMAGE = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;
const PDF = /\.pdf$/i;
const TEXT = /\.(txt|csv|md|log|json)$/i;

export const canPreview = (name = '') => IMAGE.test(name) || PDF.test(name) || TEXT.test(name);

export default function FilePreview({ name, url, onClose, onDownload }) {
  const [text, setText] = useState(null);
  const [err, setErr] = useState('');
  const isImage = IMAGE.test(name || '');
  const isPdf = PDF.test(name || '');
  const isText = TEXT.test(name || '');

  useEffect(() => {
    if (!isText || !url) return undefined;
    let alive = true;
    // Cap it: a 40MB log would freeze the tab, and nobody reads one in a modal.
    fetch(url)
      .then((r) => r.text())
      .then((t) => { if (alive) setText(t.slice(0, 20000)); })
      .catch(() => { if (alive) setErr('Could not read this file.'); });
    return () => { alive = false; };
  }, [isText, url]);

  return (
    <Modal title={name || 'Preview'} onClose={onClose} wide>
      <div className="fp-frame">
        {isPdf && (
          // A signed URL renders inline; the browser's own PDF viewer handles
          // paging and zoom, which is better than anything hand-rolled here.
          <iframe src={url} title={name} className="fp-pdf" />
        )}
        {isImage && <img src={url} alt={name} className="fp-img" />}
        {isText && (
          err ? <p className="muted">{err}</p>
              : <pre className="fp-text">{text ?? 'Loading…'}</pre>
        )}
        {!isPdf && !isImage && !isText && (
          <div className="fp-none">
            <p style={{ margin: '0 0 6px', fontWeight: 600 }}>No preview for this kind of file.</p>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              Download it to open in the app it belongs to.
            </p>
          </div>
        )}
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
        <button className="btn btn-primary" onClick={onDownload}>Download</button>
      </div>
    </Modal>
  );
}

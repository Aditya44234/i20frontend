import BubbleMenuExtension from '@tiptap/extension-bubble-menu';
import CharacterCount from '@tiptap/extension-character-count';
import Color from '@tiptap/extension-color';
import FloatingMenuExtension from '@tiptap/extension-floating-menu';
import Focus from '@tiptap/extension-focus';
import FontFamily from '@tiptap/extension-font-family';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TableOfContents from '@tiptap/extension-table-of-contents';
import TextAlign from '@tiptap/extension-text-align';
import Typography from '@tiptap/extension-typography';
import Underline from '@tiptap/extension-underline';
import UniqueId from '@tiptap/extension-unique-id';
import { BubbleMenu, EditorContent, FloatingMenu, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import React, { useState } from 'react';

interface TiptapEditorProps {
  value: string;
  onChange: (content: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  disabled?: boolean;
  onAIContentAccept?: (newContent: string) => void;
}

const TiptapEditor: React.FC<TiptapEditorProps> = ({
  value,
  onChange,
  placeholder = 'Start typing here...',
  rows = 10,
  className = '',
  disabled = false,
  onAIContentAccept,
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      BubbleMenuExtension,
      CharacterCount,
      Color,
      FloatingMenuExtension,
      Focus,
      FontFamily,
      Placeholder.configure({ placeholder }),
      TableOfContents,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Typography,
      UniqueId,
      Link,
      Image,
      Underline,
      // ...add more extensions as needed
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      onChange && onChange(editor.getHTML());
    },
    editable: !disabled,
  });

  // Action and style options
  const actionOptions = [
    { value: 'expand', label: 'Expand' },
    { value: 'rewrite', label: 'Rewrite' },
    { value: 'summarize', label: 'Summarize' },
    { value: 'improve', label: 'Improve' },
    { value: 'simplify', label: 'Simplify' },
  ];
  const styleOptions = [
    { value: 'formal', label: 'Formal' },
    { value: 'casual', label: 'Casual' },
    { value: 'creative', label: 'Creative' },
    { value: 'professional', label: 'Professional' },
  ];

  // State for dropdowns, loading, response, and modal
  const [action, setAction] = useState('rewrite');
  const [style, setStyle] = useState('formal');
  const [loading, setLoading] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState('');

  // POST request handler
  const handleSend = async () => {
    if (!editor) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('https://backend-tiptap.onrender.com/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: editor.getText(),
          action,
          style,
        }),
      });
      if (!res.ok) throw new Error('Request failed');
      const data = await res.json();
      setResponseText(data.text || '');
      setModalOpen(true);
    } catch (err: any) {
      setError('Failed to get response. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Accept response: update editor
  const handleAccept = () => {
    if (editor && responseText) {
      editor.commands.setContent(responseText);
      onChange && onChange(responseText);
      if (typeof onAIContentAccept === 'function') {
        onAIContentAccept(responseText);
      }
    }
    setModalOpen(false);
    setResponseText('');
  };

  // Resend: just close modal, allow user to change action/style and resend
  const handleResend = () => {
    setModalOpen(false);
    setResponseText('');
  };

  // Keep existing: close modal, do nothing
  const handleKeepExisting = () => {
    setModalOpen(false);
    setResponseText('');
  };

  if (!editor) return null;

  // Helper for adding a link
  const setLink = () => {
    const url = window.prompt('Enter the URL');
    if (url) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  };

  // Helper for adding an image
  const addImage = () => {
    const url = window.prompt('Enter the image URL');
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  return (
    <div className={className}>
      {/* Always-visible Toolbar */}
      <div className="tiptap-toolbar">
        <button onClick={() => editor.chain().focus().toggleBold().run()} className={editor.isActive('bold') ? 'is-active' : ''} disabled={disabled}>Bold</button>
        <button onClick={() => editor.chain().focus().toggleItalic().run()} className={editor.isActive('italic') ? 'is-active' : ''} disabled={disabled}>Italic</button>
        <button onClick={() => editor.chain().focus().toggleStrike().run()} className={editor.isActive('strike') ? 'is-active' : ''} disabled={disabled}>Strike</button>
        <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={editor.isActive('underline') ? 'is-active' : ''} disabled={disabled}>Underline</button>
        <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={editor.isActive('heading', { level: 1 }) ? 'is-active' : ''} disabled={disabled}>H1</button>
        <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={editor.isActive('heading', { level: 2 }) ? 'is-active' : ''} disabled={disabled}>H2</button>
        <button onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={editor.isActive('heading', { level: 3 }) ? 'is-active' : ''} disabled={disabled}>H3</button>
        <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={editor.isActive('bulletList') ? 'is-active' : ''} disabled={disabled}>• List</button>
        <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={editor.isActive('orderedList') ? 'is-active' : ''} disabled={disabled}>1. List</button>
        <button onClick={() => editor.chain().focus().toggleBlockquote().run()} className={editor.isActive('blockquote') ? 'is-active' : ''} disabled={disabled}>Blockquote</button>
        <button onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={editor.isActive('codeBlock') ? 'is-active' : ''} disabled={disabled}>Code</button>
        <button onClick={setLink} className={editor.isActive('link') ? 'is-active' : ''} disabled={disabled}>Link</button>
        <button onClick={() => editor.chain().focus().unsetLink().run()} disabled={disabled}>Unlink</button>
        <button onClick={addImage} disabled={disabled}>Image</button>
        <button onClick={() => editor.chain().focus().setHorizontalRule().run()} disabled={disabled}>HR</button>
        <button onClick={() => editor.chain().focus().undo().run()} disabled={disabled}>Undo</button>
        <button onClick={() => editor.chain().focus().redo().run()} disabled={disabled}>Redo</button>
        {/* Add more buttons as needed for color, alignment, etc. */}
      </div>
      {/* Action/Style Dropdowns and Send Button */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', margin: '8px 0' }}>
        <label>
          Action:
          <select value={action} onChange={e => setAction(e.target.value)} disabled={disabled || loading} style={{ marginLeft: 4 }}>
            {actionOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        <label>
          Style:
          <select value={style} onChange={e => setStyle(e.target.value)} disabled={disabled || loading} style={{ marginLeft: 4 }}>
            {styleOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        <button onClick={handleSend} disabled={disabled || loading} style={{ padding: '4px 12px' }}>
          {loading ? 'Sending...' : 'Send'}
        </button>
        {error && <span style={{ color: 'red', marginLeft: 8 }}>{error}</span>}
      </div>
      {/* Example: Bubble Menu */}
      <BubbleMenu editor={editor}>
        <button onClick={() => editor.chain().focus().toggleBold().run()} disabled={disabled}>Bold</button>
        {/* ...other buttons */}
      </BubbleMenu>
      {/* Example: Floating Menu */}
      <FloatingMenu editor={editor}>
        <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} disabled={disabled}>H1</button>
        {/* ...other buttons */}
      </FloatingMenu>
      <div className="tiptap-editor">
        <EditorContent editor={editor} style={{ minHeight: rows ? `${rows * 20}px` : undefined }} />
      </div>
      {/* Example: Character Count */}
      <div className="tiptap-character-count">Characters: {editor.storage.characterCount.characters()}</div>
      {/* Modal for response */}
      {modalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ background: 'white', padding: 24, borderRadius: 8, minWidth: 320, maxWidth: 600 }}>
            <h3>AI Response</h3>
            <div style={{ whiteSpace: 'pre-wrap', margin: '16px 0', maxHeight: 300, overflowY: 'auto' }}>{responseText}</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={handleAccept} style={{ padding: '4px 12px' }}>Accept</button>
              <button onClick={handleResend} style={{ padding: '4px 12px' }}>Resend</button>
              <button onClick={handleKeepExisting} style={{ padding: '4px 12px' }}>Keep Existing</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TiptapEditor;
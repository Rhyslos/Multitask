import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import FontFamily from '@tiptap/extension-font-family';
import Underline from '@tiptap/extension-underline';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Link from '@tiptap/extension-link';
import CharacterCount from '@tiptap/extension-character-count';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { FontWeight } from './FointWeight';

export const editorExtensions = [
    StarterKit,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TextStyle,
    Color,
    FontFamily,
    FontWeight,
    Highlight.configure({ multicolor: true }),
    Underline,
    Subscript,
    Superscript,
    Link.configure({ openOnClick: false }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder: 'Start typing your notes...' }),
    CharacterCount,
];
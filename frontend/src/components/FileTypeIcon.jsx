import {
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType2,
} from 'lucide-react';
import { fileMeta } from '../lib/format';

const ICONS = {
  pdf: FileType2,
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  docx: FileText,
  md: FileText,
  txt: FileText,
  csv: FileSpreadsheet,
  xlsx: FileSpreadsheet,
  zip: FileArchive,
};

export default function FileTypeIcon({ extension, size = 38 }) {
  const meta = fileMeta(extension);
  const Icon = ICONS[extension] || FileText;
  return (
    <span className={`file-type file-type--${meta.tone}`} style={{ width: size, height: size }}>
      <Icon size={size * 0.44} strokeWidth={1.9} />
    </span>
  );
}

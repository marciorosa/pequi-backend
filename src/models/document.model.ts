import mongoose, { Schema, Document } from 'mongoose';

export interface ILegalDocument extends Document {
  userId: mongoose.Schema.Types.ObjectId;
  title: string;
  content: string;
  documentType: string;
  templateStyle?: string;
  createdAt: Date;
  updatedAt: Date;
}

const LegalDocumentSchema = new Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  documentType: {
    type: String,
    required: true,
    trim: true
  },
  templateStyle: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

export default mongoose.model<ILegalDocument>('LegalDocument', LegalDocumentSchema);

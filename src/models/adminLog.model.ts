import mongoose, { Document, Schema } from 'mongoose';

/** Registro de cada ação feita na área administrativa (quem fez, o quê, em quem e quando). */
export interface IAdminLog extends Document {
  adminId: mongoose.Types.ObjectId;
  adminEmail: string;
  action: string;
  targetUserId?: mongoose.Types.ObjectId;
  targetEmail?: string;
  details?: string;
  createdAt: Date;
}

const AdminLogSchema = new Schema<IAdminLog>(
  {
    adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    adminEmail: { type: String, required: true },
    action: { type: String, required: true },
    targetUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    targetEmail: { type: String },
    details: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AdminLogSchema.index({ createdAt: -1 });

export default mongoose.model<IAdminLog>('AdminLog', AdminLogSchema);

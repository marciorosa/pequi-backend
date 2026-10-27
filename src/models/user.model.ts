import mongoose, { Document, Schema } from 'mongoose';

// User interface
export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: 'user' | 'admin';
  company?: string;
  phone?: string;
  image?: string;
  stripeCustomerId?: string;
  subscriptionId?: mongoose.Types.ObjectId;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  createdAt: Date;
  updatedAt: Date;
  apiUsage: {
    searchCount: number;
    chatCount: number;
    docsCount: number;
    vaultFolderCount: number;
    workflowCount: number;
  };
}

// User schema
const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, 'O nome é obrigatório'],
      trim: true
    },
    email: {
      type: String,
      required: [true, 'O e-mail é obrigatório'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Informe um e-mail válido']
    },
    password: {
      type: String,
      required: [true, 'A senha é obrigatória'],
      minlength: [6, 'A senha deve ter pelo menos 6 caracteres']
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user'
    },
    company: {
      type: String,
      trim: true
    },
    phone: {
      type: String,
      trim: true
    },
    image: {
      type: String
    },
    stripeCustomerId: {
      type: String
    },
    subscriptionId: {
      type: Schema.Types.ObjectId,
      ref: 'Subscription'
    },
    resetPasswordToken: {
      type: String
    },
    resetPasswordExpires: {
      type: Date
    },
    apiUsage: {
      searchCount: { type: Number, default: 0 },
      chatCount: { type: Number, default: 0 },
      docsCount: { type: Number, default: 0 },
      vaultFolderCount: { type: Number, default: 0 },
      workflowCount: { type: Number, default: 0 }
    }
  },
  {
    timestamps: true
  }
);

// Create indexes for better query performance
userSchema.index({ email: 1 }); // Index for faster email lookups (login/registration)
userSchema.index({ stripeCustomerId: 1 }); // Index for Stripe customer lookups
userSchema.index({ resetPasswordToken: 1, resetPasswordExpires: 1 }); // Index for password reset

// Create and export User model
const User = mongoose.model<IUser>('User', userSchema);
export default User; 
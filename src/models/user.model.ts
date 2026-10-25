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
      required: [true, 'Name is required'],
      trim: true
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password should be at least 6 characters']
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
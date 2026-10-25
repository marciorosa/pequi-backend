import mongoose, { Schema, Document } from 'mongoose';

export interface IWorkflowNode {
    id: string;
    type: string;
    data: {
        label: string;
        icon?: any;
        nodeType: 'trigger' | 'action' | 'output';
        subtype: string;
        config?: Record<string, any>;
    };
    position: { x: number; y: number };
}

export interface IWorkflowEdge {
    id: string;
    source: string;
    target: string;
}

export interface IWorkflow extends Document {
    userId: mongoose.Types.ObjectId;
    name: string;
    description?: string;
    nodes: IWorkflowNode[];
    edges: IWorkflowEdge[];
    status: 'active' | 'paused' | 'draft';
    lastRun?: Date;
    runCount: number;
    createdAt: Date;
    updatedAt: Date;
}

const NodeSchema = new Schema({
    id: String,
    type: String,
    data: Schema.Types.Mixed,
    position: { x: Number, y: Number }
}, { _id: false });

const EdgeSchema = new Schema({
    id: String,
    source: String,
    target: String
}, { _id: false });

const WorkflowSchema = new Schema<IWorkflow>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },
        nodes: {
            type: [NodeSchema],
            default: [],
        },
        edges: {
            type: [EdgeSchema],
            default: [],
        },
        status: {
            type: String,
            enum: ['active', 'paused', 'draft'],
            default: 'draft',
        },
        lastRun: Date,
        runCount: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
    }
);

WorkflowSchema.index({ userId: 1 });

const Workflow = mongoose.model<IWorkflow>('Workflow', WorkflowSchema);
export default Workflow;

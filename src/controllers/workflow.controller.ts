import { Response } from 'express';
import { AuthRequest } from '../types';
import Workflow from '../models/workflow.model';
import { WorkflowExecutionService } from '../services/workflow-execution.service';

/** GET /api/workflows */
export const getWorkflows = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const workflows = await Workflow.find({ userId }).sort({ updatedAt: -1 });
        res.json({ workflows });
    } catch (err) {
        res.status(500).json({ message: 'Falha ao carregar os fluxos de trabalho' });
    }
};

/** POST /api/workflows */
export const createWorkflow = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { name, nodes, edges, status } = req.body;

        const workflow = new Workflow({
            userId,
            name,
            nodes,
            edges,
            status,
        });

        await workflow.save();
        res.status(201).json({ workflow });
    } catch (err) {
        res.status(500).json({ message: 'Falha ao criar o fluxo de trabalho' });
    }
};

/** PUT /api/workflows/:id */
export const updateWorkflow = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { id } = req.params;
        const updates = req.body;

        const workflow = await Workflow.findOneAndUpdate(
            { _id: id, userId },
            { $set: updates },
            { new: true }
        );

        if (!workflow) return res.status(404).json({ message: 'Fluxo de trabalho não encontrado' });
        res.json({ workflow });
    } catch (err) {
        res.status(500).json({ message: 'Falha ao atualizar o fluxo de trabalho' });
    }
};

/** DELETE /api/workflows/:id */
export const deleteWorkflow = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { id } = req.params;

        const workflow = await Workflow.findOneAndDelete({ _id: id, userId });
        if (!workflow) return res.status(404).json({ message: 'Fluxo de trabalho não encontrado' });

        res.json({ message: 'Fluxo de trabalho excluído' });
    } catch (err) {
        res.status(500).json({ message: 'Falha ao excluir o fluxo de trabalho' });
    }
};

/** POST /api/workflows/:id/run */
export const runWorkflow = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { id } = req.params;
        const { isSimulation, fileName } = req.body;

        const workflow = await Workflow.findOne({ _id: id, userId });
        if (!workflow) return res.status(404).json({ message: 'Fluxo de trabalho não encontrado' });

        // Update stats
        workflow.runCount += 1;
        workflow.lastRun = new Date();
        await workflow.save();


        // Execute in background
        WorkflowExecutionService.execute(id, {
            testFile: isSimulation ? {
                name: fileName || (req.file as any)?.originalname || 'simulation_doc.pdf',
                buffer: (req.file as any)?.buffer
            } : undefined
        }).catch(err => {
        });

        res.json({
            message: isSimulation ? 'Simulação iniciada' : 'Execução do fluxo de trabalho iniciada',
            executionId: Date.now().toString(),
            steps: workflow.nodes.length
        });
    } catch (err) {
        res.status(500).json({ message: 'Falha ao executar o fluxo de trabalho' });
    }
};

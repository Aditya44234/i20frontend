
import React, { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { DataSet, Manuscript, ModuleStage, Proposal, ResearchIdea, ResearchProject, StatisticalAnalysis, UserRole } from '../types';
import { useAuth } from './AuthContext';

interface ProjectContextType {
  currentProject: ResearchProject | null;
  startNewProject: (title: string, initialIdea?: Partial<ResearchIdea>) => void;
  updateProject: (updates: Partial<ResearchProject>) => void;
  updateIdea: (ideaUpdates: Partial<ResearchIdea>) => void;
  updateProposal: (proposalUpdates: Partial<Proposal>) => void;
  updateDataSet: (dataSetUpdates: Partial<DataSet>) => void;
  updateAnalysis: (analysisUpdates: Partial<StatisticalAnalysis>) => void;
  updateManuscript: (manuscriptUpdates: Partial<Manuscript>) => void;
  assignExpert: (expertType: 'researcher' | 'statistician' | 'dataEngineer', expertId: string) => void;
  setProjectStage: (stage: ModuleStage) => void;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  clearError: () => void;
  setProposalBackgroundFromLiteratureSummary: () => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [currentProject, setCurrentProject] = useState<ResearchProject | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const startNewProject = useCallback((title: string, initialIdea?: Partial<ResearchIdea>) => {
    if (!currentUser || currentUser.role !== UserRole.HCP) {
        setError("Only Healthcare Professionals can start new projects.");
        return;
    }
    const newProject: ResearchProject = {
      id: `proj_${Date.now()}`,
      title,
      hcpId: currentUser.id,
      currentStage: ModuleStage.IDEA_GENERATION, // Default to Ideation Hub stage
      idea: initialIdea ? { concept: '', ...initialIdea } as ResearchIdea : undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setCurrentProject(newProject);
    setError(null);
  }, [currentUser]);

  const updateProjectState = useCallback((projectUpdater: (prev: ResearchProject | null) => ResearchProject | null) => {
    setCurrentProject(prev => {
      const updated = projectUpdater(prev);
      if (updated) {
        return { ...updated, updatedAt: new Date() };
      }
      return null;
    });
  }, []);

  const updateProject = useCallback((updates: Partial<ResearchProject>) => {
    updateProjectState(prev => (prev ? { ...prev, ...updates } : null));
  }, [updateProjectState]);

  const updateIdea = useCallback((ideaUpdates: Partial<ResearchIdea>) => {
    updateProjectState(prev => {
        if (!prev) return null;
        // Ensure aiReport is handled correctly, merging if it exists
        const existingIdea = prev.idea || { concept: '' };
        const updatedIdea = { ...existingIdea, ...ideaUpdates };
        if (ideaUpdates.aiReport && existingIdea.aiReport) {
            updatedIdea.aiReport = { ...existingIdea.aiReport, ...ideaUpdates.aiReport };
        }
        return { ...prev, idea: updatedIdea as ResearchIdea };
    });
  }, [updateProjectState]);

  const updateProposal = useCallback((proposalUpdates: Partial<Proposal>) => {
    updateProjectState(prev => (prev ? { ...prev, proposal: { ...prev.proposal, ...proposalUpdates } as Proposal } : null));
  }, [updateProjectState]);
  
  const updateDataSet = useCallback((dataSetUpdates: Partial<DataSet>) => {
    updateProjectState(prev => (prev ? { ...prev, dataSet: { ...prev.dataSet, ...dataSetUpdates } as DataSet } : null));
  }, [updateProjectState]);

  const updateAnalysis = useCallback((analysisUpdates: Partial<StatisticalAnalysis>) => {
    updateProjectState(prev => (prev ? { ...prev, analysis: { ...prev.analysis, ...analysisUpdates } as StatisticalAnalysis } : null));
  }, [updateProjectState]);

  const updateManuscript = useCallback((manuscriptUpdates: Partial<Manuscript>) => {
    updateProjectState(prev => (prev ? { ...prev, manuscript: { ...prev.manuscript, ...manuscriptUpdates } as Manuscript } : null));
  }, [updateProjectState]);

  const assignExpert = useCallback((expertType: 'researcher' | 'statistician' | 'dataEngineer', expertId: string) => {
    updateProjectState(prev => {
      if (!prev) return null;
      if (expertType === 'researcher') {
        return { ...prev, assignedResearcher: expertId, idea: { ...prev.idea, expertAssigned: true } as ResearchIdea };
      } else if (expertType === 'statistician') {
        return { ...prev, assignedStatistician: expertId, proposal: { ...prev.proposal, statisticianAssigned: true } as Proposal };
      } else if (expertType === 'dataEngineer') {
        return { ...prev, assignedDataEngineer: expertId };
      }
      return prev;
    });
  }, [updateProjectState]);

  const setProjectStage = useCallback((stage: ModuleStage) => {
     // When moving to a new stage, initialize that stage's object if it doesn't exist
    updateProjectState(prev => {
        if (!prev) return null;
        let updates: Partial<ResearchProject> = { currentStage: stage };
        
        if (stage === ModuleStage.PROPOSAL_DEVELOPMENT && !prev.proposal) {
            updates.proposal = { title: `Proposal for ${prev.title}`, sections: {}, ethicsStatus: "Not Submitted" };
        } else if (stage === ModuleStage.DATA_COLLECTION_ANALYSIS && !prev.dataSet) {
            updates.dataSet = { name: `Data for ${prev.title}`, description: "" };
        } else if (stage === ModuleStage.DATA_COLLECTION_ANALYSIS && !prev.analysis) {
            // Also init analysis if not present when moving to data stage
             updates.analysis = { plan: "" };
        } else if (stage === ModuleStage.MANUSCRIPT_WRITING && !prev.manuscript) {
            updates.manuscript = { title: `Manuscript for ${prev.title}`, sections: {}, status: "Drafting" };
        }
        return { ...prev, ...updates };
    });
  }, [updateProjectState]);

  const clearError = useCallback(() => setError(null), []);
  
  const setProposalBackgroundFromLiteratureSummary = useCallback(() => {
    setCurrentProject(prev => {
      if (!prev || !prev.idea?.aiReport?.literatureSummary) return prev;
      const newBackground = prev.idea.aiReport.literatureSummary;
      return {
        ...prev,
        proposal: {
          ...prev.proposal,
          sections: {
            ...prev.proposal?.sections,
            background: newBackground,
          },
          ethicsStatus: prev.proposal?.ethicsStatus || "Not Submitted",
        }
      };
    });
  }, []);

  const value = useMemo(() => ({
    currentProject,
    startNewProject,
    updateProject,
    updateIdea,
    updateProposal,
    updateDataSet,
    updateAnalysis,
    updateManuscript,
    assignExpert,
    setProjectStage,
    isLoading,
    setIsLoading,
    error,
    setError,
    clearError,
    setProposalBackgroundFromLiteratureSummary,
  }), [currentProject, startNewProject, updateProject, updateIdea, updateProposal, updateDataSet, updateAnalysis, updateManuscript, assignExpert, setProjectStage, isLoading, error, clearError, setProposalBackgroundFromLiteratureSummary]);

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
};

export const useProject = (): ProjectContextType => {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
};

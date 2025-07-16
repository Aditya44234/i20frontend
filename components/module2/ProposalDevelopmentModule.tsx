import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellIcon, CheckCircleIcon, DocumentTextIcon, SparklesIcon } from '../../assets/icons';
import { MOCK_KNOWLEDGE_BASES, MOCK_USERS } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { useProject } from '../../contexts/ProjectContext';
import { generateTextWithRAG } from '../../services/geminiService';
import { ModuleStage, UserRole } from '../../types';
import { ModuleWrapper } from '../core/ModuleWrapper';
import { Button } from '../shared/Button';
import { Card } from '../shared/Card';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { NotificationBanner } from '../shared/NotificationBanner';
import { TextAreaInput } from '../shared/TextAreaInput';
import TiptapEditor from '../shared/TiptapEditor';

const PROPOSAL_SECTIONS = [
    { id: "background", name: "Detailed Background", placeholder: "Expand on the literature, identify gaps..." },
    { id: "objectives", name: "Research Objectives/Hypotheses", placeholder: "Clearly state primary and secondary objectives or testable hypotheses." },
    { id: "methodology", name: "Methodology", placeholder: "Study design, patient population, data collection methods, variables..." },
    { id: "sampleSize", name: "Sample Size Justification", placeholder: "How was the sample size determined? Power calculations?" },
    { id: "dataAnalysisPlan", name: "Data Analysis Plan", placeholder: "Statistical methods to be used for each objective." },
    { id: "budget", name: "Budget (Brief Outline)", placeholder: "Estimated costs for personnel, supplies, etc. (if applicable)." },
    { id: "ethics", name: "Ethical Considerations", placeholder: "Patient consent, data privacy, potential risks and mitigation." },
    { id: "dissemination", name: "Dissemination Plan", placeholder: "How will findings be shared? (e.g., publication, presentation)." },
];

export const ProposalDevelopmentModule: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { 
    currentProject, 
    updateProposal,
    isLoading, 
    setIsLoading, 
    error, 
    setError,
    assignExpert,
    setProjectStage,
    clearError
  } = useProject(); 

  const [activeSection, setActiveSection] = useState<string | null>(PROPOSAL_SECTIONS[0].id);
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
  const [showMeetingPlaceholder, setShowMeetingPlaceholder] = useState(false);

  useEffect(() => {
    if (currentProject?.proposal) {
      // setProposal(currentProject.proposal); // This line is removed as per the new_code
    } else if (currentProject?.idea?.concept) {
      // setProposal(prev => ({ // This line is removed as per the new_code
      //   ...prev,
      //   title: currentProject.title || "Research Proposal",
      //   sections: {
      //     ...prev.sections,
      //     background: currentProject.idea?.background || '',
      //     objectives: currentProject.idea?.objective || '',
      //     methodology: currentProject.idea?.methodology || '',
      //   },
      //   ethicsStatus: "Not Submitted",
      // }));
    } else {
      // setProposal({ sections: {}, ethicsStatus: "Not Submitted" }); // This line is removed as per the new_code
    }

    if (currentProject?.assignedResearcher && !currentProject.proposal) {
        setShowMeetingPlaceholder(true);
    }

  }, [currentProject]);

  const handleSectionChange = (sectionId: string, value: string) => {
    if (!currentProject?.proposal) return;
    updateProposal({
      ...currentProject.proposal,
      sections: {
        ...currentProject.proposal.sections,
        [sectionId]: value,
      },
    });
  };

  const handleSaveProposal = () => {
    if (!currentProject) return;
    updateProposal(currentProject.proposal);
    setNotification({ message: "Proposal draft saved successfully!", type: 'success' });
  };
  
  const getAISectionSuggestion = async (sectionId: string) => {
    if (!currentProject || !currentProject.proposal) {
      setError("No active project or proposal to get suggestions for.");
      return;
    }
    setIsLoading(true);
    clearError();
    setNotification(null);

    const currentSectionContent = currentProject.proposal.sections[sectionId] || '';
    const ideaSummary = `
        Project Title: ${currentProject.title}
        Core Idea: ${currentProject.idea?.concept || 'N/A'}
        Background: ${currentProject.idea?.background || 'N/A'}
        Objective: ${currentProject.idea?.objective || 'N/A'}
    `;

    const ragContext = `Knowledge Base Context:
    - ${MOCK_KNOWLEDGE_BASES.INSTITUTIONAL_GUIDELINES_SIM}
    - Example approved proposal section for '${sectionId}': [Simulated content for a strong ${sectionId} section...]
    - Common pitfalls for '${sectionId}': [Simulated list of common mistakes for this section...]`;

    const systemInstruction = `You are an AI assistant for writing clinical research proposals. For the section '${PROPOSAL_SECTIONS.find(s=>s.id===sectionId)?.name || sectionId}', provide contextual suggestions. Focus on structure, key elements, and compliance.`;
    
    const prompt = `Research Idea Summary:
    ${ideaSummary}
    Current content for section "${PROPOSAL_SECTIONS.find(s=>s.id===sectionId)?.name || sectionId}":
    ---
    ${currentSectionContent}
    ---
    Provide suggestions to enhance this section based on the RAG context. Output as a bulleted list.`;

    const response = await generateTextWithRAG(prompt, ragContext, systemInstruction);

    if (response.text && !response.error) {
        handleSectionChange(sectionId, `${currentSectionContent}\n\n--- AI Suggestions ---\n${response.text}`);
        setNotification({ message: `AI suggestions for '${sectionId}' loaded.`, type: 'info' });
    } else {
        setError(response.error || "Failed to get AI suggestions.");
        setNotification({ message: `Error: ${response.error}`, type: 'error' });
    }
    setIsLoading(false);
  };

  const submitToEthics = () => {
    if (!currentProject) return;
    updateProposal({ ethicsStatus: "Submitted" });
    setNotification({ message: "Proposal submitted to Ethics Committee/IRB (Simulated).", type: 'success'});
  };

  const simulateEthicsFeedback = () => {
     if (!currentProject) return;
     const feedback = "The Ethics Committee has reviewed your proposal. Please clarify the patient recruitment strategy (Section: Methodology) and provide more details on data anonymization (Section: Ethics). Resubmission required.";
     updateProposal({ ethicsStatus: "Feedback Received", ethicsFeedback: feedback });
     setNotification({ message: "Simulated feedback received from Ethics Committee.", type: 'info' });
  };

  const markEthicsApproved = () => {
    if (!currentProject) return;
    updateProposal({ ethicsStatus: "Approved", ethicsFeedback: "Congratulations! Your proposal has been approved." });
    
    const statistician = MOCK_USERS.find(u => u.role === UserRole.STATISTICIAN);
    if (statistician) {
        assignExpert('statistician', statistician.id);
        setNotification({ message: `Proposal Approved! Statistician "${statistician.name}" has been assigned (12 hours allocated).`, type: 'success' });
    } else {
        setNotification({ message: "Proposal Approved! (No mock statistician found).", type: 'success' });
    }
  };

  const proceedToDataCollection = () => {
    if (currentProject?.proposal?.ethicsStatus === "Approved") {
        setProjectStage(ModuleStage.DATA_COLLECTION_ANALYSIS);
        setNotification({ message: "Proceeding to Data Collection & Analysis.", type: 'success' });
        navigate('/data');
    } else {
        setError("Proposal must be approved by Ethics Committee before proceeding.");
        setNotification({ message: "Proposal must be approved by Ethics Committee before proceeding.", type: 'error' });
    }
  };
  
  const canEdit = currentUser?.role === UserRole.HCP || currentUser?.role === UserRole.RESEARCHER;

  if (!currentProject || !currentProject.idea) {
    return (
      <ModuleWrapper title="Proposal Development & Ethics" icon={<DocumentTextIcon />}>
        <Card>
          <p className="text-gray-600 text-center py-8">
            Please complete the 'IDEA Hub' module first. A validated research idea is required.
          </p>
        </Card>
      </ModuleWrapper>
    );
  }


  return (
    <ModuleWrapper title="Proposal Development & Ethics" icon={<DocumentTextIcon />} subtitle={`For project: ${currentProject.title}`}>
      {notification && <NotificationBanner type={notification.type} message={notification.message} onDismiss={() => setNotification(null)} />}
      {error && <NotificationBanner type="error" message={error} onDismiss={clearError} />}

      {showMeetingPlaceholder && (
          <Card title="Initial Consultation" icon={<BellIcon />} className="mb-6 bg-info-light border-info-light">
              <p className="text-info-textLight">
                  An Experienced Researcher (<strong>{MOCK_USERS.find(u => u.id === currentProject.assignedResearcher)?.name || 'Expert'}</strong>) is assigned.
                  A (simulated) 1-hour collaborative meeting should be scheduled.
              </p>
              <Button onClick={() => setShowMeetingPlaceholder(false)} size="sm" variant="secondary" className="mt-3">Mark as Met (Simulated)</Button>
          </Card>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <Card title="Proposal Sections">
            <nav className="space-y-1">
              {PROPOSAL_SECTIONS.map(section => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors
                    ${activeSection === section.id 
                      ? 'bg-primary-500 text-white' 
                      : 'text-gray-700 hover:bg-gray-100'}`}
                >
                  {section.name}
                </button>
              ))}
            </nav>
            {canEdit && (
                <Button onClick={handleSaveProposal} isLoading={isLoading} className="w-full mt-6" variant="primary">
                    Save Draft Proposal
                </Button>
            )}
          </Card>
        </div>

        <div className="md:col-span-2">
          {activeSection && PROPOSAL_SECTIONS.find(s => s.id === activeSection) && (
            <Card 
                title={`Editing: ${PROPOSAL_SECTIONS.find(s => s.id === activeSection)?.name}`}
                actions={canEdit && (
                    <Button 
                        onClick={() => getAISectionSuggestion(activeSection)} 
                        isLoading={isLoading} 
                        size="sm" 
                        variant="ghost"
                        leftIcon={<SparklesIcon className="h-4 w-4"/>}
                    >
                        AI Suggestions
                    </Button>
                )}
            >
              <TiptapEditor
                value={currentProject?.proposal?.sections?.[activeSection] || ''}
                onChange={content => handleSectionChange(activeSection, content)}
                placeholder={PROPOSAL_SECTIONS.find(s => s.id === activeSection)?.placeholder}
                rows={15}
                className="min-h-[300px]"
                disabled={!canEdit || isLoading}
                onAIContentAccept={content => {
                  handleSectionChange(activeSection, content);
                  handleSaveProposal();
                  setNotification({
                    message: `${PROPOSAL_SECTIONS.find(s => s.id === activeSection)?.name || activeSection} section updated with AI suggestion and saved!`,
                    type: 'success',
                  });
                }}
              />
              {!canEdit && <p className="text-sm text-red-500 mt-2">You do not have permission to edit this proposal.</p>}
            </Card>
          )}

          <Card title="Ethics Committee / IRB Workflow" icon={<CheckCircleIcon />} className="mt-6">
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-700">Current Status: 
                  <span className={`ml-2 font-semibold px-2 py-0.5 rounded-full text-xs
                    ${currentProject?.proposal?.ethicsStatus === "Approved" ? "bg-success-light text-success-textLight" :
                      currentProject?.proposal?.ethicsStatus === "Submitted" ? "bg-yellow-100 text-yellow-700" : 
                      currentProject?.proposal?.ethicsStatus === "Feedback Received" ? "bg-orange-100 text-orange-700" : 
                      "bg-gray-100 text-gray-700"}`}>
                    {currentProject?.proposal?.ethicsStatus}
                  </span>
                </p>
                {currentProject?.proposal?.ethicsFeedback && (
                  <div className="mt-2 p-3 bg-gray-50 border rounded-md text-sm text-gray-600">
                    <strong>Feedback/Notes:</strong> {currentProject?.proposal?.ethicsFeedback}
                  </div>
                )}
              </div>

              {isLoading && <LoadingSpinner message="Processing request..." />}

              <div className="flex flex-wrap gap-2">
                {canEdit && currentProject?.proposal?.ethicsStatus === "Not Submitted" && (
                  <Button onClick={submitToEthics} isLoading={isLoading} variant="primary">Submit to Ethics (Simulated)</Button>
                )}
                {currentProject?.proposal?.ethicsStatus === "Submitted" && (
                  <Button onClick={simulateEthicsFeedback} isLoading={isLoading} variant="secondary">Simulate Ethics Feedback</Button>
                )}
                {canEdit && currentProject?.proposal?.ethicsStatus === "Feedback Received" && (
                  <>
                    <p className="text-sm text-gray-600 w-full">Address feedback in proposal sections, then resubmit or mark as approved.</p>
                    <TextAreaInput 
                        label="Draft Response to Ethics Committee (Optional)"
                        placeholder="Draft your response here. AI can help refine it."
                        rows={3}
                    />
                    <Button onClick={submitToEthics} isLoading={isLoading} variant="primary">Resubmit to Ethics (Simulated)</Button>
                    <Button onClick={markEthicsApproved} isLoading={isLoading} variant="ghost">Force Mark Approved (Dev)</Button>
                  </>
                )}
                 {canEdit && currentProject?.proposal?.ethicsStatus !== "Approved" && currentProject?.proposal?.ethicsStatus !== "Feedback Received" && currentProject?.proposal?.ethicsStatus !== "Submitted" && (
                     <Button onClick={markEthicsApproved} isLoading={isLoading} variant="ghost" size="sm">Force Mark Approved (Dev)</Button>
                 )}
              </div>
              
              {currentProject.proposal?.statisticianAssigned && currentProject.assignedStatistician && (
                <div className="mt-4 p-3 bg-info-light border border-info-light rounded-md flex items-center">
                    <BellIcon className="h-6 w-6 text-info mr-3"/>
                    <p className="text-sm text-info-textLight">
                        A Statistician (<strong>{MOCK_USERS.find(u=>u.id === currentProject.assignedStatistician)?.name || 'Expert'}</strong>) has been notionally assigned.
                    </p>
                </div>
              )}

              {currentProject?.proposal?.ethicsStatus === "Approved" && (
                <Button onClick={proceedToDataCollection} isLoading={isLoading} className="mt-4" variant="primary">
                  Proceed to Data Collection & Analysis
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>
    </ModuleWrapper>
  );
};

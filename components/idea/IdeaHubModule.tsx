import axios from 'axios';
import React, { ChangeEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowTrendingUpIcon, BellIcon, ChatBubbleLeftEllipsisIcon, ChevronDownIcon, Cog6ToothIcon, LightBulbIcon, SparklesIcon } from '../../assets/icons';
import { IDEATION_MODE_CONFIG, MOCK_USERS } from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import { useProject } from '../../contexts/ProjectContext';
import { generateJsonOutput } from '../../services/geminiService';
import { AIReport, IdeationMode, ModuleStage, ResearchIdea, UserRole } from '../../types';
import { ChatInterface } from '../core/ChatInterface';
import { ModuleWrapper } from '../core/ModuleWrapper';
import { Button } from '../shared/Button';
import { Card } from '../shared/Card';
import { Gauge } from '../shared/Gauge';
import { InfoTooltip } from '../shared/InfoTooltip';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { NotificationBanner } from '../shared/NotificationBanner';
import { TextAreaInput } from '../shared/TextAreaInput';
import { TextInput } from '../shared/TextInput';

export const IdeaHubModule: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { 
    currentProject, 
    startNewProject, 
    updateIdea, 
    isLoading: projectLoading, 
    setIsLoading: setProjectLoading, 
    error: projectError, 
    setError: setProjectError,
    assignExpert,
    setProjectStage,
    clearError,
    setProposalBackgroundFromLiteratureSummary
  } = useProject();
  
  const [projectTitle, setProjectTitle] = useState('');
  const [ideaInput, setIdeaInput] = useState<Partial<ResearchIdea>>({ concept: '' });
  const [selectedIdeationMode, setSelectedIdeationMode] = useState<IdeationMode>(IdeationMode.CLINICIAN_LED);
  
  const [hcpProfile, setHcpProfile] = useState({ experience: '', specialty: '', interests: '' });
  const [autonomousIdeas, setAutonomousIdeas] = useState<{id: string; question: string; rationale: string}[]>([]);
  const [selectedAutonomousIdea, setSelectedAutonomousIdea] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' | 'info' | 'warning' } | null>(null);

  // --- Future House API Integration ---
  const [fhQuestion, setFhQuestion] = useState("");
  const [fhTaskId, setFhTaskId] = useState<string | null>(null);
  const [fhAnswer, setFhAnswer] = useState<string | null>(null);
  const [fhLoading, setFhLoading] = useState(false);
  const BACKEND_BASE_URL = "https://i20backend.onrender.com";
  const CREATE_TASK_URL = `${BACKEND_BASE_URL}/api/create-task`;
  const GET_ANSWER_URL = `${BACKEND_BASE_URL}/api/get-answer`;

  const handleFHAskQuestion = async () => {
    if (!fhQuestion.trim()) return; // Prevent sending empty questions
    setFhLoading(true);
    setFhAnswer(null);
    try {
      // Send the user's question in the POST body
      const response = await axios.post(CREATE_TASK_URL, { question: fhQuestion });
      setFhTaskId(response.data.task_id);
      pollForFHAnswer(response.data.task_id);
    } catch (error) {
      setFhLoading(false);
      alert("Failed to create Future House task.");
    }
  };

  const pollForFHAnswer = (taskId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await axios.get(`${GET_ANSWER_URL}?task_id=${taskId}`);
        if (response.data.answer) {
          setFhAnswer(response.data.answer);
          setFhLoading(false);
          clearInterval(interval);
        } else if (response.data.status === "pending or not found") {
          // Still waiting, do nothing
        } else {
          setFhLoading(false);
          clearInterval(interval);
          alert("Unexpected response from Future House API.");
        }
      } catch (error) {
        setFhLoading(false);
        clearInterval(interval);
        alert("Failed to fetch answer from Future House API.");
      }
    }, 20000);
  };

  useEffect(() => {
    if (currentProject) {
        setProjectTitle(currentProject.title || '');
        if (currentProject.idea) {
            setIdeaInput(currentProject.idea);
            setSelectedIdeationMode(currentProject.idea.ideationMode || IdeationMode.CLINICIAN_LED); 
        } else {
            setIdeaInput({ concept: '', ideationMode: IdeationMode.CLINICIAN_LED });
            setSelectedIdeationMode(IdeationMode.CLINICIAN_LED); 
        }
    } else {
      setProjectTitle('');
      setIdeaInput({ concept: '', ideationMode: IdeationMode.CLINICIAN_LED });
      setSelectedIdeationMode(IdeationMode.CLINICIAN_LED); 
    }
  }, [currentProject]);

  const handleModeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const mode = event.target.value as IdeationMode;
    setSelectedIdeationMode(mode);
    if (currentProject) {
        updateIdea({ ideationMode: mode, aiReport: undefined, noveltyScore: undefined, similarityScore: undefined }); 
    }
    setIdeaInput(prev => ({ ...prev, ideationMode: mode, aiReport: undefined, noveltyScore: undefined, similarityScore: undefined }));
    setSelectedAutonomousIdea(null); 
    setNotification(null);
  };
  
  const handleInputChange = (field: keyof ResearchIdea, value: string) => {
    setIdeaInput(prev => ({ ...prev, [field]: value }));
  };

  const handleHcpProfileChange = (field: keyof typeof hcpProfile, value: string) => {
    setHcpProfile(prev => ({ ...prev, [field]: value }));
  };

  const handleStartNewProject = () => {
    if (!projectTitle.trim()) {
      setProjectError("Project title cannot be empty.");
      return;
    }
    startNewProject(projectTitle, { ideationMode: selectedIdeationMode });
    setIdeaInput({ concept: '', ideationMode: selectedIdeationMode }); 
    setNotification(null);
  };

  const validateIdeaAndGenerateReport = async () => {
    if (!currentProject || (!ideaInput.concept?.trim() && selectedIdeationMode === IdeationMode.CLINICIAN_LED)) {
      setProjectError("Please provide an initial research concept for Clinician-Led Ideation.");
      return;
    }
    setProjectLoading(true);
    clearError();
    setNotification(null);

    const ragContext = `Knowledge Base Context (simulated):
    - PubMed API: Trends in telehealth, AI diagnostics.
    - Gaps: Long-term effects of new drug X, comparative effectiveness of Y vs Z.`;

    const systemInstruction = "You are an AI assistant specialized in clinical research ideation. Analyze the provided research concept against the knowledge base context. Provide a concise report in JSON format with fields: literatureSummary (string), researchGaps (string), noveltyScore (number 0-100, where 100 is highly novel), similarityScore (number 0-100, where 0 is no similarity to existing work and 100 is highly similar), feasibilityAssessment (string, preliminary), aiSuggestions (string, actionable points for refinement, if applicable).";
    
    const prompt = `Research Concept:
    Background: ${ideaInput.background || (selectedIdeationMode === IdeationMode.AUTONOMOUS_AI && ideaInput.concept ? ideaInput.background : 'Not provided')}
    Objective/Hypothesis: ${ideaInput.objective || 'Not provided'}
    Methodology Idea: ${ideaInput.methodology || 'Not provided'}
    Significance: ${ideaInput.significance || 'Not provided'}
    Expected Outcomes: ${ideaInput.expectedOutcomes || 'Not provided'}
    Core Concept: ${ideaInput.concept}

    Analyze this concept using the provided knowledge base context. Output must be JSON.`;

    type AIReportResponse = Omit<AIReport, 'noveltyRating' | 'similarityRating'> & { noveltyScore: number; similarityScore: number; aiSuggestions?: string };

    const response = await generateJsonOutput<AIReportResponse>(`${ragContext}\n\n${prompt}`, systemInstruction);

    if (response.data) {
      const reportData = { 
        ...response.data, 
        noveltyRating: response.data.noveltyScore > 80 ? "High" : response.data.noveltyScore > 60 ? "Medium" : "Low",
        similarityRating: response.data.similarityScore < 30 ? "Low (Unique)" : response.data.similarityScore < 60 ? "Medium" : "High (Similar)",
      };
      updateIdea({ 
          ...ideaInput, 
          aiReport: reportData, 
          noveltyScore: response.data.noveltyScore, 
          similarityScore: response.data.similarityScore 
        });
      setNotification({ message: "AI analysis report generated successfully!", type: 'success' });

      if (response.data.noveltyScore >= 60) { 
        const researcher = MOCK_USERS.find(u => u.role === UserRole.RESEARCHER);
        if (researcher && currentProject && !currentProject.assignedResearcher) {
          assignExpert('researcher', researcher.id);
          setNotification({ message: `Potential idea! Experienced Researcher "${researcher.name}" has been notionally assigned. (12 hours allocated)`, type: 'info' });
        }
      }
    } else {
      setProjectError(response.error || "Failed to generate AI report. Raw output: " + response.rawText);
      setNotification({ message: `Error generating report: ${response.error || "Unknown error"}`, type: 'error' });
    }
    setProjectLoading(false);
  };
  
  const handleAiCoCreation = async () => {
    if (!currentProject) {
        setProjectError("Please start a project first."); return;
    }
    if (!hcpProfile.specialty.trim() || !hcpProfile.interests.trim()) {
        setProjectError("Please provide your specialty and research interests for AI Co-Creation."); return;
    }
    setNotification({ message: "AI Co-Creation Partnership initiated. Use the chat below.", type: 'info'});
  };

  const handleLoadAutonomousIdeas = async () => {
     if (!currentProject) {
        setProjectError("Please start a project first to review AI-generated ideas in context."); return;
    }
    setProjectLoading(true); clearError(); setNotification(null);
    const systemInstruction = "You are an AI that generates novel research hypotheses by synthesizing diverse data sources (simulated). Generate three distinct novel research questions suitable for an HCP to investigate. Output as a JSON array: [{ 'id': 'idea_1', 'question': '...', 'rationale': '...' }, ...]";
    const prompt = `Simulated Data Sources Review:
    - Literature Trends: PubMed API (keywords: emerging diseases, treatment gaps, AI in medicine)
    - EHR Metadata (de-identified): Increased incidence of condition X in demographic Y.
    Generate three novel research questions.`;

    const response = await generateJsonOutput<{id: string; question: string; rationale: string}[]>(prompt, systemInstruction);
    if (response.data) {
        setAutonomousIdeas(response.data);
        setNotification({ message: `Loaded ${response.data.length} AI-generated idea suggestions.`, type: 'info' });
    } else {
        setProjectError(response.error || "Failed to load autonomous AI ideas.");
        setNotification({ message: `Error: ${response.error}`, type: 'error' });
    }
    setProjectLoading(false);
  };

  const handleSelectAutonomousIdea = (idea: {id: string; question: string; rationale: string}) => {
    setSelectedAutonomousIdea(idea.id);
    const autoIdeaForInput = {
        concept: idea.question,
        background: idea.rationale,
        ideationMode: IdeationMode.AUTONOMOUS_AI,
        aiReport: undefined, 
        noveltyScore: undefined,
        similarityScore: undefined,
    };
    setIdeaInput(autoIdeaForInput);
     if (currentProject) { 
        updateIdea(autoIdeaForInput);
    }
    setNotification({message: `Selected AI Idea: "${idea.question}". You can now request an AI Analysis Report.`, type: 'info'});
  };

  const proceedToProposal = () => {
    if (currentProject && currentProject.idea ) {
        if (!currentProject.idea.aiReport && selectedIdeationMode !== IdeationMode.AI_CO_CREATION ) {
            setProjectError("Please generate and review the AI Analysis Report for your selected idea before proceeding.");
            return;
        }
        updateIdea({ isNovel: (currentProject.idea.noveltyScore || 0) >= 60 }); 
        if (currentProject.idea.aiReport?.literatureSummary) {
          console.log('Literature Summary:', currentProject.idea.aiReport.literatureSummary);
        } else {
          console.log('No Literature Summary found.');
        }
        setProposalBackgroundFromLiteratureSummary();
        setProjectStage(ModuleStage.PROPOSAL_DEVELOPMENT);
        setNotification({message: "Idea stage complete! Proceeding to Proposal Development.", type: 'success'});
        navigate('/proposal');
    } else {
        setProjectError("Please select an ideation mode, develop an idea, and (if applicable) review its AI report before proceeding.");
    }
  };

  const isHCP = currentUser?.role === UserRole.HCP;

  return (
    <ModuleWrapper 
        title="IDEA Hub: Ideation & Validation" 
        icon={<LightBulbIcon />} 
        subtitle="Craft, co-create, or discover research ideas with powerful AI assistance."
    >
      {/* --- Future House API UI (always on top) --- */}
      <Card title="Ask Future House API" icon={<SparklesIcon />} className="mb-6">
        <div style={{ maxWidth: 600, margin: "0 auto", padding: 16 }}>
          <TextInput
            label="Your Question"
            value={fhQuestion}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setFhQuestion(e.target.value)}
            placeholder="Type your question for Future House API"
          />
          <Button onClick={handleFHAskQuestion} disabled={fhLoading || !fhQuestion.trim()} className="mt-2">
            Ask
          </Button>
          {fhLoading && <p>Waiting for answer...</p>}
          {fhAnswer && (
            <div style={{ marginTop: 24, background: "#f0f0f0", padding: 16 }}>
              <strong>Answer:</strong>
              <p>{fhAnswer}</p>
            </div>
          )}
        </div>
      </Card>
      {notification && <NotificationBanner type={notification.type} message={notification.message} onDismiss={() => setNotification(null)} />}
      {projectError && <NotificationBanner type="error" message={projectError} onDismiss={clearError} />}
      
      {!currentProject && isHCP && (
        <Card title="Start a New Research Project" icon={<SparklesIcon />} className="mb-6 border-primary-200 bg-primary-50">
          <div className="space-y-4">
            <TextInput 
              label="Project Title" 
              placeholder="Enter a descriptive title for your research project"
              value={projectTitle} 
              onChange={(e) => setProjectTitle(e.target.value)} 
              className="mb-3"
            />
             <Button 
                onClick={handleStartNewProject} 
                disabled={projectLoading || !projectTitle.trim() || !selectedIdeationMode}
                className="w-full"
                variant="primary"
            >
                Start Project using "{IDEATION_MODE_CONFIG.find(m => m.mode === selectedIdeationMode)?.title || selectedIdeationMode}"
            </Button>
          </div>
        </Card>
      )}
       {!isHCP && !currentProject && (
         <Card className="mb-6 text-center">
            <p className="text-gray-600">Only Healthcare Professionals (HCPs) can initiate new projects. Other roles can view active projects once assigned.</p>
        </Card>
      )}

      <Card 
        title="Select Ideation Mode" 
        icon={<Cog6ToothIcon />} 
        className="mb-6"
      >
        <div className="relative">
            <select
                id="ideationModeSelect"
                value={selectedIdeationMode}
                onChange={handleModeChange}
                className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 appearance-none bg-white text-gray-700 pr-8"
                disabled={projectLoading || !!currentProject} 
                aria-label="Select Ideation Mode"
            >
            {IDEATION_MODE_CONFIG.map(modeConfig => (
                <option key={modeConfig.mode} value={modeConfig.mode}>
                {modeConfig.title}
                </option>
            ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                <ChevronDownIcon className="h-5 w-5"/>
            </div>
        </div>
        {selectedIdeationMode && (
            <p className="text-xs text-gray-500 mt-2 flex items-center">
                <InfoTooltip text={IDEATION_MODE_CONFIG.find(m => m.mode === selectedIdeationMode)?.tooltip || ''} position="right" />
                <span className="ml-1">{IDEATION_MODE_CONFIG.find(m => m.mode === selectedIdeationMode)?.tooltip}</span>
            </p>
        )}
         {currentProject && <p className="text-xs text-orange-500 mt-2">Mode is locked once a project is active. To change mode, start a new project.</p>}
      </Card>
      
      {currentProject && selectedIdeationMode && (
        <div className="space-y-6">
            <Card className="mb-0" title={`Active Project: ${currentProject.title}`}>
                 <p className="text-sm text-gray-500">Mode: <span className="font-medium text-primary-600">{IDEATION_MODE_CONFIG.find(m=>m.mode === (currentProject.idea?.ideationMode || selectedIdeationMode))?.title || selectedIdeationMode}</span></p>
            </Card>

            {selectedIdeationMode === IdeationMode.CLINICIAN_LED && (
                <Card title="Define Your Research Idea" icon={<LightBulbIcon />}>
                <div className="space-y-4">
                    <TextAreaInput label="Core Research Concept / Question" value={ideaInput.concept || ''} onChange={e => handleInputChange('concept', e.target.value)} rows={3} placeholder="Briefly describe your main research idea or question." disabled={!isHCP || projectLoading}/>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <TextAreaInput label="Background (Optional)" value={ideaInput.background || ''} onChange={e => handleInputChange('background', e.target.value)} placeholder="What is already known? What is the context?" disabled={!isHCP || projectLoading}/>
                    <TextAreaInput label="Research Objective / Hypothesis (Optional)" value={ideaInput.objective || ''} onChange={e => handleInputChange('objective', e.target.value)} placeholder="What specific question will you answer or hypothesis will you test?" disabled={!isHCP || projectLoading}/>
                    <TextAreaInput label="Brief Methodology Idea (Optional)" value={ideaInput.methodology || ''} onChange={e => handleInputChange('methodology', e.target.value)} placeholder="How might you conduct this research?" disabled={!isHCP || projectLoading}/>
                    <TextAreaInput label="Significance / Potential Impact (Optional)" value={ideaInput.significance || ''} onChange={e => handleInputChange('significance', e.target.value)} placeholder="Why is this research important? Who will benefit?" disabled={!isHCP || projectLoading}/>
                    </div>
                    <TextAreaInput label="Expected Outcomes (Optional)" value={ideaInput.expectedOutcomes || ''} onChange={e => handleInputChange('expectedOutcomes', e.target.value)} placeholder="What do you anticipate finding?" disabled={!isHCP || projectLoading}/>
                    {!isHCP && <p className="text-sm text-red-500">Only HCPs can input idea details.</p>}
                </div>
                </Card>
            )}

            {selectedIdeationMode === IdeationMode.AI_CO_CREATION && (
                <Card title="AI Co-Pilot for Idea Discovery" icon={<ChatBubbleLeftEllipsisIcon />}>
                    <div className="space-y-4 mb-4 p-3 border rounded-md bg-blue-50 border-blue-200">
                        <h5 className="text-sm font-medium text-gray-700">Your Profile (for personalized AI suggestions):</h5>
                        <TextInput label="Your Experience Level" value={hcpProfile.experience} onChange={e => handleHcpProfileChange('experience', e.target.value)} placeholder="e.g., Junior Resident, Senior Consultant" disabled={!isHCP || projectLoading} />
                        <TextInput label="Your Specialty" value={hcpProfile.specialty} onChange={e => handleHcpProfileChange('specialty', e.target.value)} placeholder="e.g., Cardiology, Pediatrics" disabled={!isHCP || projectLoading}/>
                        <TextAreaInput label="Your Research Interests" value={hcpProfile.interests} onChange={e => handleHcpProfileChange('interests', e.target.value)} rows={2} placeholder="Keywords or phrases" disabled={!isHCP || projectLoading}/>
                        <Button onClick={handleAiCoCreation} isLoading={projectLoading} disabled={!hcpProfile.specialty.trim() || !hcpProfile.interests.trim() || !isHCP} size="sm" variant="secondary">
                            Update Profile & Start Chat
                        </Button>
                        {!isHCP && <p className="text-xs text-red-500">Only HCPs can use AI Co-Creation.</p>}
                    </div>
                    <ChatInterface 
                        systemInstruction={`You are an AI research partner. The HCP's profile is: Specialty - ${hcpProfile.specialty || 'Not specified'}, Interests - ${hcpProfile.interests || 'Not specified'}. Engage in an interactive dialogue to co-create a novel research idea. Help refine thoughts into a concrete research question. Start by suggesting 2-3 broad areas based on their profile.`}
                        placeholder="Chat with AI to develop your research idea..."
                        onNewAIMessage={(aiMsg) => {
                            if (currentProject) updateIdea({ concept: `Co-created (AI Partnership): ${aiMsg.text.substring(0,100)}...`});
                        }}
                        className="border-t border-gray-200 pt-4"
                    />
                </Card>
            )}
            
            {selectedIdeationMode === IdeationMode.AUTONOMOUS_AI && (
                <Card title="Autonomous AI-Driven Discovery" icon={<ArrowTrendingUpIcon />}>
                    <p className="text-sm text-gray-600 mb-3">
                        Review novel research questions/hypotheses generated autonomously by AI. Select one to explore further.
                    </p>
                    <Button onClick={handleLoadAutonomousIdeas} isLoading={projectLoading} leftIcon={<SparklesIcon className="h-4 w-4"/>} size="sm" className="mb-3" variant="secondary">
                        Load AI-Generated Idea Suggestions
                    </Button>
                    {autonomousIdeas.length > 0 && (
                        <div className="space-y-2 max-h-60 overflow-y-auto mb-3">
                            {autonomousIdeas.map(idea => (
                                <div 
                                    key={idea.id} 
                                    className={`p-2 border rounded-md cursor-pointer transition-all hover:shadow-sm 
                                                ${selectedAutonomousIdea === idea.id 
                                                    ? 'bg-primary-100 border-primary-300 ring-1 ring-primary-300' 
                                                    : 'bg-gray-50 border-gray-200'}`}
                                    onClick={() => handleSelectAutonomousIdea(idea)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSelectAutonomousIdea(idea)}
                                >
                                    <h5 className="font-medium text-primary-700 text-sm">{idea.question}</h5>
                                    <p className="text-xs text-gray-500 mt-0.5">{idea.rationale}</p>
                                </div>
                            ))}
                        </div>
                    )}
                    {selectedAutonomousIdea && ideaInput.concept && (
                        <div className="mt-2 p-3 border border-green-200 rounded-md bg-green-50">
                            <h5 className="font-medium text-green-700 text-sm">Selected for In-depth Analysis:</h5>
                            <p className="text-gray-800 text-sm mt-1"><strong>Question:</strong> {ideaInput.concept}</p>
                        </div>
                    )}
                </Card>
            )}
            
            { (isHCP && (ideaInput.concept?.trim() || selectedAutonomousIdea)) || currentProject.idea?.aiReport ? (
                <Card 
                    title="AI Analysis & Validation Report" 
                    icon={<SparklesIcon />}
                    actions={ isHCP && (!currentProject.idea?.aiReport || projectLoading) && (
                        <Button onClick={validateIdeaAndGenerateReport} isLoading={projectLoading} disabled={!ideaInput.concept?.trim()} size="sm" variant="primary">
                            Generate AI Analysis Report
                        </Button>
                    )}
                >
                {projectLoading && !currentProject.idea?.aiReport && <LoadingSpinner message="AI is analyzing..." />}
                {currentProject.idea?.aiReport ? (
                    <div className="space-y-3">
                        <Gauge value={currentProject.idea.noveltyScore || 0} label="Novelty Score" />
                        <Gauge value={currentProject.idea.similarityScore || 0} label="Similarity Score" lowerIsBetter={true} />
                        
                        <div><strong className="text-sm text-gray-700">Literature Summary:</strong> <p className="text-xs text-gray-600 whitespace-pre-wrap mt-1 p-2 bg-white rounded border border-gray-200 max-h-32 overflow-y-auto">{currentProject.idea.aiReport.literatureSummary}</p></div>
                        <div><strong className="text-sm text-gray-700">Identified Research Gaps:</strong> <p className="text-xs text-gray-600 whitespace-pre-wrap mt-1 p-2 bg-white rounded border border-gray-200 max-h-32 overflow-y-auto">{currentProject.idea.aiReport.researchGaps}</p></div>
                        <div><strong className="text-sm text-gray-700">Initial Feasibility Assessment:</strong> <p className="text-xs text-gray-600 whitespace-pre-wrap mt-1 p-2 bg-white rounded border border-gray-200 max-h-32 overflow-y-auto">{currentProject.idea.aiReport.feasibilityAssessment}</p></div>
                        {currentProject.idea.aiReport.aiSuggestions && (
                            <div><strong className="text-sm text-gray-700">AI Suggestions for Refinement:</strong> <p className="text-xs text-gray-600 whitespace-pre-wrap mt-1 p-2 bg-white rounded border border-gray-200 max-h-32 overflow-y-auto">{currentProject.idea.aiReport.aiSuggestions}</p></div>
                        )}
                        {currentProject.idea?.expertAssigned && currentProject.assignedResearcher && (
                            <div className="mt-3 p-2 bg-info-light border border-info-light rounded-md flex items-center">
                                <BellIcon className="h-5 w-5 text-info mr-2"/>
                                <p className="text-xs text-info-textLight">
                                    Experienced Researcher (<strong>{MOCK_USERS.find(u=>u.id === currentProject.assignedResearcher)?.name || 'Expert'}</strong>) notionally assigned.
                                </p>
                            </div>
                        )}
                    </div>
                ) : (
                    !projectLoading && isHCP && <p className="text-sm text-gray-500">Enter your idea details (Clinician-Led) or select an AI-Generated idea, then click "Generate AI Analysis Report".</p>
                )}
                </Card>
            ) : null}
            
            {isHCP && (
                <Button 
                    onClick={proceedToProposal} 
                    disabled={projectLoading || (!currentProject.idea?.aiReport && selectedIdeationMode !== IdeationMode.AI_CO_CREATION)} 
                    className="mt-6 w-full" 
                    size="lg"
                    variant="primary"
                >
                    Proceed to Proposal Development
                </Button>
            )}
        </div>
      )}
    </ModuleWrapper>
  );
};

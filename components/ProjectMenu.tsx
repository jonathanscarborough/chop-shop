'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAllProjects, saveProject, Project } from '@/lib/db';

interface ProjectMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProjectMenu({ isOpen, onClose }: ProjectMenuProps) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string>('');

  useEffect(() => {
    // Load current project ID from localStorage
    const storedProjectId = localStorage.getItem('currentProjectId');
    if (storedProjectId) {
      setCurrentProjectId(storedProjectId);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      loadProjects();
    }
  }, [isOpen]);

  const loadProjects = async () => {
    try {
      const loadedProjects = await getAllProjects();
      // Sort by last modified (newest first)
      loadedProjects.sort((a, b) => b.lastModified - a.lastModified);
      setProjects(loadedProjects);
      console.log('Loaded projects:', loadedProjects.length);
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const createNewProject = async () => {
    const projectName = prompt('Enter project name:');
    if (!projectName || !projectName.trim()) {
      return;
    }

    try {
      const projectId = `project-${Date.now()}`;
      await saveProject({
        id: projectId,
        name: projectName.trim(),
        createdAt: Date.now(),
        lastModified: Date.now()
      });

      // Switch to the new project
      localStorage.setItem('currentProjectId', projectId);
      setCurrentProjectId(projectId);

      // Reload the page to refresh the project
      window.location.reload();
    } catch (error) {
      console.error('Failed to create project:', error);
      alert('Failed to create project. Please try again.');
    }
  };

  const selectProject = (projectId: string) => {
    if (projectId === currentProjectId) {
      onClose();
      return;
    }

    // Switch to the selected project
    localStorage.setItem('currentProjectId', projectId);
    setCurrentProjectId(projectId);

    // Reload the page to refresh the project
    window.location.reload();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />

      {/* Menu */}
      <div className="fixed right-0 top-0 bottom-0 w-80 bg-gray-900 z-50 shadow-xl">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex justify-between items-center p-4 border-b border-gray-800">
            <h2 className="text-white text-xl font-bold">Projects</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Project List */}
          <div className="flex-1 overflow-auto p-4 space-y-2">
            {projects.length === 0 ? (
              <div className="text-gray-400 text-center py-8">
                No projects yet.<br />
                Create one to get started!
              </div>
            ) : (
              projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => selectProject(project.id)}
                  className={`w-full p-4 rounded-xl text-white text-left transition-all ${
                    project.id === currentProjectId
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-gray-800 hover:bg-gray-700'
                  }`}
                >
                  <div className="font-bold">{project.name}</div>
                  <div className="text-xs text-gray-300 mt-1">
                    {new Date(project.lastModified).toLocaleDateString()}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* New Project Button */}
          <div className="p-4 border-t border-gray-800">
            <button
              onClick={createNewProject}
              className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold"
            >
              + New Project
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

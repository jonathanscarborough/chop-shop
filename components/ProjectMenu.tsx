'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAllProjects, saveProject, deleteProject, Project } from '@/lib/db';

interface ProjectMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenHowToUse?: () => void;
}

export default function ProjectMenu({ isOpen, onClose, onOpenHowToUse }: ProjectMenuProps) {
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

  const renameProject = async (projectId: string, currentName: string) => {
    const newName = prompt('Enter new project name:', currentName);
    if (!newName || !newName.trim() || newName.trim() === currentName) {
      return;
    }

    try {
      const project = projects.find(p => p.id === projectId);
      if (project) {
        await saveProject({
          ...project,
          name: newName.trim(),
          lastModified: Date.now()
        });
        await loadProjects();
      }
    } catch (error) {
      console.error('Failed to rename project:', error);
      alert('Failed to rename project. Please try again.');
    }
  };

  const handleDeleteProject = async (projectId: string, projectName: string) => {
    if (!confirm(`Are you sure you want to delete "${projectName}"?\n\nThis will permanently delete all samples in this project.`)) {
      return;
    }

    try {
      await deleteProject(projectId);

      // If we're deleting the current project, switch to another one or create default
      if (projectId === currentProjectId) {
        const remainingProjects = projects.filter(p => p.id !== projectId);

        if (remainingProjects.length > 0) {
          // Switch to the first remaining project
          localStorage.setItem('currentProjectId', remainingProjects[0].id);
        } else {
          // Create a new default project
          const defaultProjectId = 'default-project';
          await saveProject({
            id: defaultProjectId,
            name: 'My First Project',
            createdAt: Date.now(),
            lastModified: Date.now()
          });
          localStorage.setItem('currentProjectId', defaultProjectId);
        }

        // Reload the page
        window.location.reload();
      } else {
        // Just reload the project list
        await loadProjects();
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
      alert('Failed to delete project. Please try again.');
    }
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
                <div
                  key={project.id}
                  className={`w-full p-4 rounded-xl text-white transition-all ${
                    project.id === currentProjectId
                      ? 'bg-blue-600'
                      : 'bg-gray-800'
                  }`}
                >
                  <button
                    onClick={() => selectProject(project.id)}
                    className="w-full text-left"
                  >
                    <div className="font-bold">{project.name}</div>
                    <div className="text-xs text-gray-300 mt-1">
                      {new Date(project.lastModified).toLocaleDateString()}
                    </div>
                  </button>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        renameProject(project.id, project.name);
                      }}
                      className="flex-1 h-8 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold flex items-center justify-center gap-1"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Rename
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteProject(project.id, project.name);
                      }}
                      className="flex-1 h-8 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center justify-center gap-1"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer Buttons */}
          <div className="p-4 border-t border-gray-800 space-y-2">
            {onOpenHowToUse && (
              <button
                onClick={() => {
                  onOpenHowToUse();
                  onClose();
                }}
                className="w-full h-12 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-bold flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                How to Use
              </button>
            )}
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

'use client';

import React, { useState } from 'react';
import { useProjects, Project } from '@/contexts/ProjectContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Trash2, Plus, FolderOpen, Clock, FileText } from 'lucide-react';

interface ProjectsManagerProps {
  onSelectProject?: (projectId: string) => void;
  onClose?: () => void;
}

export function ProjectsManager({ onSelectProject, onClose }: ProjectsManagerProps) {
  const { projects, addProject, deleteProject, setCurrentProject } = useProjects();
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [newProjectData, setNewProjectData] = useState({
    name: '',
    description: '',
    url: ''
  });

  const handleCreateProject = () => {
    if (!newProjectData.name.trim() || !newProjectData.url.trim()) {
      alert('Please fill in project name and URL');
      return;
    }

    const project = addProject({
      name: newProjectData.name,
      description: newProjectData.description,
      url: newProjectData.url
    });

    setNewProjectData({ name: '', description: '', url: '' });
    setShowNewProjectForm(false);

    if (onSelectProject) {
      onSelectProject(project.id);
    }
  };

  const handleSelectProject = (projectId: string) => {
    setCurrentProject(projectId);
    if (onSelectProject) {
      onSelectProject(projectId);
    }
    onClose?.();
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5" />
              Projects Manager
            </CardTitle>
            <CardDescription>
              Manage your saved projects. All projects are stored locally in your browser.
            </CardDescription>
          </div>
          <Button
            onClick={() => setShowNewProjectForm(!showNewProjectForm)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Project
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {showNewProjectForm && (
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-6 space-y-4">
              <div>
                <Label htmlFor="project-name" className="text-sm font-medium">
                  Project Name *
                </Label>
                <Input
                  id="project-name"
                  placeholder="My Awesome Website"
                  value={newProjectData.name}
                  onChange={(e) =>
                    setNewProjectData(prev => ({ ...prev, name: e.target.value }))
                  }
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="project-url" className="text-sm font-medium">
                  Website URL *
                </Label>
                <Input
                  id="project-url"
                  placeholder="https://example.com"
                  value={newProjectData.url}
                  onChange={(e) =>
                    setNewProjectData(prev => ({ ...prev, url: e.target.value }))
                  }
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="project-description" className="text-sm font-medium">
                  Description (Optional)
                </Label>
                <Input
                  id="project-description"
                  placeholder="Brief description of your project"
                  value={newProjectData.description}
                  onChange={(e) =>
                    setNewProjectData(prev => ({ ...prev, description: e.target.value }))
                  }
                  className="mt-1"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={handleCreateProject}
                  className="bg-green-600 hover:bg-green-700"
                >
                  Create Project
                </Button>
                <Button
                  onClick={() => setShowNewProjectForm(false)}
                  variant="outline"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {projects.length === 0 ? (
          <Alert>
            <AlertDescription className="text-center py-8">
              <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-600">No projects yet. Create your first project to get started!</p>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700">
              {projects.length} {projects.length === 1 ? 'project' : 'projects'} found
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {projects.map(project => (
                <Card
                  key={project.id}
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => handleSelectProject(project.id)}
                >
                  <CardContent className="pt-6">
                    <div className="space-y-3">
                      <div>
                        <h3 className="font-semibold text-lg text-gray-900">
                          {project.name}
                        </h3>
                        {project.description && (
                          <p className="text-sm text-gray-600 mt-1">
                            {project.description}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <div className="text-xs text-gray-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Updated: {formatDate(project.updatedAt)}
                        </div>
                        <a
                          href={project.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-800 break-all"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {project.url}
                        </a>
                      </div>

                      {project.sandboxId && (
                        <Badge variant="outline" className="bg-green-50 text-green-700">
                          Sandbox Active
                        </Badge>
                      )}

                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          className="flex-1 bg-blue-600 hover:bg-blue-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectProject(project.id);
                          }}
                        >
                          Open
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete project "${project.name}"?`)) {
                              deleteProject(project.id);
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t">
          {onClose && (
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}


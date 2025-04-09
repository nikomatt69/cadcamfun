import React, { useState } from 'react';
import { NextPage } from 'next';
import { useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/src/components/ui/Card';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { Textarea } from 'src/components/ui/textarea';
import { Label } from 'src/components/ui/label';
import { Switch } from 'src/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from 'src/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/Tabs';

interface FormData {
  description: string;
  maxElements?: number;
  materials?: string;
  useMCP: boolean;
  model: string;
  strategy: 'exact' | 'semantic' | 'hybrid';
}

const MCPExample: NextPage = () => {
  const { register, handleSubmit, watch, setValue } = useForm<FormData>({
    defaultValues: {
      description: '',
      useMCP: true,
      model: 'claude-3-5-sonnet-20240229',
      strategy: 'semantic',
    }
  });
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  
  const useMCP = watch('useMCP');
  const model = watch('model');
  const strategy = watch('strategy');
  
  const onSubmit = async (data: FormData) => {
    setLoading(true);
    
    try {
      // Prepara i materiali come array
      const materialsArray = data.materials 
        ? data.materials.split(',').map(m => m.trim()) 
        : undefined;
      
      // Costruisci la richiesta
      const requestBody = {
        description: data.description,
        sessionId,
        constraints: {
          maxElements: data.maxElements,
          preferredMaterials: materialsArray
        },
        model: data.model
      };
      
      // Effettua la chiamata API
      const response = await fetch('/api/mcp/generate-assembly', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      
      const result = await response.json();
      
      if (result.success) {
        setResult(result.data);
        setSessionId(result.data.sessionId);
        toast.success('Assembly generated successfully!');
      } else {
        toast.error(result.message || 'Failed to generate assembly');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('An error occurred');
    } finally {
      setLoading(false);
    }
  };
  
  const loadSessionInfo = async () => {
    if (!sessionId) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/mcp/session?sessionId=${sessionId}`);
      const data = await response.json();
      
      if (data.success) {
        setSessionInfo(data.data);
        toast.success('Session info loaded');
      } else {
        toast.error(data.message || 'Failed to load session');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('An error occurred');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="container max-w-6xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Model Context Protocol (MCP) Example</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Generate CAD Assembly</CardTitle>
              <CardDescription>
                Generate a CAD assembly from a text description using the MCP protocol
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea 
                    id="description"
                    placeholder="Describe the assembly you want to create..."
                    {...register('description', { required: true })}
                    className="h-32"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="maxElements">Max Elements</Label>
                    <Input 
                      id="maxElements"
                      type="number"
                      {...register('maxElements', { valueAsNumber: true })}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="materials">Materials (comma separated)</Label>
                    <Input 
                      id="materials"
                      placeholder="steel, aluminum, etc."
                      {...register('materials')}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="model">AI Model</Label>
                  <Select 
                    defaultValue={model}
                    onValueChange={(value) => setValue('model', value)}
                  >
                    <SelectTrigger id="model">
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="claude-3-5-sonnet-20240229">Claude 3.5 Sonnet</SelectItem>
                      <SelectItem value="claude-3-haiku-20240307">Claude 3 Haiku</SelectItem>
                      <SelectItem value="claude-3-opus-20240229">Claude 3 Opus</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch 
                    id="useMCP"
                    checked={useMCP}
                    onCheckedChange={(checked) => setValue('useMCP', checked)}
                  />
                  <Label htmlFor="useMCP">Enable MCP Protocol</Label>
                </div>
                
                {useMCP && (
                  <div className="space-y-2">
                    <Label htmlFor="strategy">Cache Strategy</Label>
                    <Select 
                      defaultValue={strategy}
                      onValueChange={(value: any) => setValue('strategy', value)}
                    >
                      <SelectTrigger id="strategy">
                        <SelectValue placeholder="Select strategy" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="exact">Exact Match</SelectItem>
                        <SelectItem value="semantic">Semantic Search</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Generating...' : 'Generate Assembly'}
                </Button>
              </form>
            </CardContent>
          </Card>
          
          {sessionId && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Session Information</CardTitle>
                <CardDescription>
                  Details about the current MCP session
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-sm">
                  <p><strong>Session ID:</strong> {sessionId}</p>
                </div>
                <Button 
                  onClick={loadSessionInfo} 
                  disabled={loading} 
                  className="mt-4"
                  variant="outline"
                >
                  Load Session Info
                </Button>
                
                {sessionInfo && (
                  <div className="mt-4 p-4 bg-muted rounded-md">
                    <h3 className="font-medium mb-2">Session Details</h3>
                    <pre className="text-xs overflow-auto">
                      {JSON.stringify(sessionInfo, null, 2)}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
        
        <div>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Result</CardTitle>
              <CardDescription>
                Generated CAD assembly data
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[calc(100%-88px)] overflow-auto">
              {result ? (
                <Tabs defaultValue="json">
                  <TabsList>
                    <TabsTrigger value="json">JSON</TabsTrigger>
                    <TabsTrigger value="elements">Elements ({result.allElements?.length || 0})</TabsTrigger>
                  </TabsList>
                  <TabsContent value="json" className="min-h-[400px]">
                    <pre className="text-xs p-4 bg-muted rounded-md overflow-auto max-h-[calc(100vh-300px)]">
                      {JSON.stringify(result, null, 2)}
                    </pre>
                  </TabsContent>
                  <TabsContent value="elements" className="min-h-[400px]">
                    {result.allElements?.length > 0 ? (
                      <div className="space-y-4">
                        {result.allElements.map((element: any, index: number) => (
                          <div key={index} className="p-4 bg-muted rounded-md">
                            <h3 className="font-medium mb-2">{element.name || `Element ${index + 1}`}</h3>
                            <pre className="text-xs overflow-auto">
                              {JSON.stringify(element, null, 2)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground">No elements found.</p>
                    )}
                  </TabsContent>
                </Tabs>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">Generate an assembly to see the result here.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default MCPExample; 
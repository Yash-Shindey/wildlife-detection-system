"use client";

import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Camera, AlertTriangle, Battery, Activity } from 'lucide-react';

const WildlifeDetectionInterface = () => {
  // System State Management
  const [systemState, setSystemState] = useState({
    isActive: true,
    powerMode: 'ACTIVE',
    detections: [],
    recentAlerts: [],
    batteryLevel: 100,
    lightCondition: 'unknown'
  });

  // Detection Data Management
  const [detectionData, setDetectionData] = useState([]);
  const [analyticsData, setAnalyticsData] = useState({
    totalDetections: 0,
    detectionsByType: {},
    hourlyActivity: Array(24).fill(0)
  });

  // Camera and Analysis References
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(document.createElement('canvas'));
  const previousFrameRef = useRef(null);
  const analysisContextRef = useRef(null);
  const processingRef = useRef(false);
  const analysisIntervalRef = useRef(null);

  // Camera Configuration
  const cameraConfig = {
    sensitivity: 20,
    minimumPixelDifference: 10,
    samplingInterval: 50,
    gridSize: 32
  };

  // Initialize camera with error handling
  const initializeCamera = async () => {
    try {
      const constraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          const canvas = canvasRef.current;
          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;
          analysisContextRef.current = canvas.getContext('2d', { willReadFrequently: true });
          startFrameAnalysis();
        };
      }
    } catch (error) {
      console.error('Camera initialization failed:', error);
    }
  };

  // Frame analysis function
  const analyzeFrame = () => {
    if (!videoRef.current || !videoRef.current.videoWidth || processingRef.current || !analysisContextRef.current) {
      return;
    }

    processingRef.current = true;
    const context = analysisContextRef.current;
    const canvas = canvasRef.current;

    try {
      context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      if (!previousFrameRef.current) {
        previousFrameRef.current = new Uint8ClampedArray(data);
        processingRef.current = false;
        return;
      }

      let totalMotion = 0;
      let motionPoints = 0;

      // Enhanced pixel sampling
      const skipFactor = 8;
      for (let y = 0; y < canvas.height; y += skipFactor) {
        for (let x = 0; x < canvas.width; x += skipFactor) {
          const i = (y * canvas.width + x) * 4;
          const diff = Math.abs(data[i] - previousFrameRef.current[i]) +
                      Math.abs(data[i + 1] - previousFrameRef.current[i + 1]) +
                      Math.abs(data[i + 2] - previousFrameRef.current[i + 2]);

          if (diff > cameraConfig.minimumPixelDifference) {
            totalMotion += diff;
            motionPoints++;
          }
        }
      }

      previousFrameRef.current.set(data);

      if (motionPoints > 0) {
        const intensity = Math.min(totalMotion / (motionPoints * 765), 1);
        const detection = {
          timestamp: new Date().toISOString(),
          intensity,
          confidence: calculateConfidence(intensity, motionPoints),
          type: classifyMotion(intensity, motionPoints)
        };

        handleDetection(detection);
      }
    } catch (error) {
      console.error('Frame analysis error:', error);
    } finally {
      processingRef.current = false;
    }
  };

  // Start frame analysis
  const startFrameAnalysis = () => {
    if (analysisIntervalRef.current) {
      clearInterval(analysisIntervalRef.current);
    }

    analysisIntervalRef.current = setInterval(() => {
      if (systemState.isActive) {
        analyzeFrame();
      }
    }, 100);
  };

  // Detection confidence calculation
  const calculateConfidence = (intensity, points) => {
    const intensityFactor = Math.min(intensity * 2, 1);
    const coverageFactor = Math.min(points / 1000, 1);
    return (intensityFactor * 0.6 + coverageFactor * 0.4);
  };

  // Motion classification
  const classifyMotion = (intensity, points) => {
    if (intensity > 0.7 && points > 500) return 'LARGE_ANIMAL';
    if (intensity > 0.4 && points > 200) return 'MEDIUM_ANIMAL';
    if (intensity > 0.2 && points > 50) return 'SMALL_ANIMAL';
    return 'AMBIENT_MOTION';
  };

  // Handle new detections
  const handleDetection = (detection) => {
    if (detection.confidence > 0.4) {
      setSystemState(prev => ({
        ...prev,
        detections: [detection, ...prev.detections].slice(0, 100),
        recentAlerts: detection.confidence > 0.6
          ? [detection, ...prev.recentAlerts].slice(0, 5)
          : prev.recentAlerts
      }));

      setDetectionData(prev => [...prev, {
        time: new Date(detection.timestamp).toLocaleTimeString(),
        intensity: detection.intensity,
        confidence: detection.confidence,
        type: detection.type
      }].slice(-50));

      updateAnalytics(detection);
    }
  };

  // Update analytics
  const updateAnalytics = (detection) => {
    setAnalyticsData(prev => {
      const hour = new Date(detection.timestamp).getHours();
      const hourlyActivity = [...prev.hourlyActivity];
      hourlyActivity[hour]++;

      return {
        totalDetections: prev.totalDetections + 1,
        detectionsByType: {
          ...prev.detectionsByType,
          [detection.type]: (prev.detectionsByType[detection.type] || 0) + 1
        },
        hourlyActivity
      };
    });
  };

  // Cleanup function
  const cleanup = () => {
    if (analysisIntervalRef.current) {
      clearInterval(analysisIntervalRef.current);
      analysisIntervalRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    previousFrameRef.current = null;
    processingRef.current = false;
  };

  // Initialize camera when system becomes active
  useEffect(() => {
    if (systemState.isActive) {
      initializeCamera();
    } else {
      cleanup();
    }
    return cleanup;
  }, [systemState.isActive]);

  // Battery simulation
  useEffect(() => {
    const interval = setInterval(() => {
      setSystemState(prev => ({
        ...prev,
        batteryLevel: Math.max(0, prev.batteryLevel - (prev.powerMode === 'ACTIVE' ? 0.1 : 0.01))
      }));
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-800">Wildlife Detection System</h1>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSystemState(prev => ({ 
                  ...prev, 
                  isActive: !prev.isActive 
                }))}
                className={`px-4 py-2 rounded-lg text-white ${
                  systemState.isActive ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'
                } transition-colors`}
              >
                {systemState.isActive ? 'Active' : 'Inactive'}
              </button>
              <div className="flex items-center gap-2">
                <Battery className={`h-6 w-6 ${
                  systemState.batteryLevel > 20 ? 'text-green-500' : 'text-red-500'
                }`} />
                <span className="font-medium">{Math.round(systemState.batteryLevel)}%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Camera Feed */}
          <div className="bg-white rounded-lg shadow-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">Detection Zone</h2>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  streamRef.current 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {streamRef.current ? 'Camera Active' : 'Initializing...'}
                </span>
              </div>
            </div>
            <div className="relative aspect-video bg-gray-900 rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {!streamRef.current && (
                <div className="absolute inset-0 flex items-center justify-center text-white">
                  <p className="text-lg">Initializing Camera...</p>
                </div>
              )}
              {detectionData.slice(-1)[0]?.confidence > 0.8 && (
                <div className="absolute inset-0 border-4 border-red-500 animate-pulse" />
              )}
            </div>
          </div>

          {/* Activity Graph */}
          <div className="bg-white rounded-lg shadow-lg p-4">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Activity Monitor</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={detectionData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Line 
                    type="monotone" 
                    dataKey="intensity" 
                    stroke="#2563eb" 
                    dot={false}
                    name="Motion Intensity"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="confidence" 
                    stroke="#059669" 
                    dot={false}
                    name="Detection Confidence"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Recent Alerts */}
          <div className="bg-white rounded-lg shadow-lg p-4 md:col-span-2">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Recent Alerts</h2>
            <div className="space-y-2">
              {systemState.recentAlerts.map((alert, index) => (
                <div 
                  key={index}
                  className={`p-4 rounded-lg flex items-start gap-3 ${
                    alert.confidence > 0.8 
                      ? 'bg-red-50 text-red-800 border border-red-200'
                      : 'bg-blue-50 text-blue-800 border border-blue-200'
                  }`}
                >
                  <AlertTriangle className="h-5 w-5 mt-0.5" />
                  <div>
                    <p className="font-medium">
                      {alert.type} detected
                    </p>
                    <p className="text-sm opacity-90">
                      Confidence: {Math.round(alert.confidence * 100)}%
                      {' - '}
                      {new Date(alert.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
              {systemState.recentAlerts.length === 0 && (
                <p className="text-gray-500 text-center py-4">
                  No recent alerts
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WildlifeDetectionInterface;
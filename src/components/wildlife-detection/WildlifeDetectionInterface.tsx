'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Battery, Video, Image } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const WildlifeDetectionInterface = () => {
  // States
  const [systemState, setSystemState] = useState({
    isActive: true,
    powerMode: 'ACTIVE',
    batteryLevel: 100
  });
  const [availableCameras, setAvailableCameras] = useState([]);
  // Analysis States
const [detectionData, setDetectionData] = useState([]);
const [analyticsData, setAnalyticsData] = useState({
  totalDetections: 0,
  detectionsByType: {},
  hourlyActivity: Array(24).fill(0)
});
  
  const [selectedCamera, setSelectedCamera] = useState('built-in');
  const [selectedTab, setSelectedTab] = useState('live');
  const [recordingState, setRecordingState] = useState('idle');
  const [recordings, setRecordings] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  
  // Refs
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  // Analysis Refs
const canvasRef = useRef(document.createElement('canvas'));
const previousFrameRef = useRef(null);
const analysisContextRef = useRef(null);
const processingRef = useRef(false);
const analysisIntervalRef = useRef(null);

// Camera configuration
const cameraConfig = {
  sensitivity: 20,
  minimumPixelDifference: 10,
  samplingInterval: 50,
  gridSize: 32
};


// Analysis Functions
const analyzeFrame = () => {
  if (!videoRef.current || !videoRef.current.videoWidth || processingRef.current || !analysisContextRef.current) {
    return;
  }

  processingRef.current = true;
  const context = analysisContextRef.current;
  const canvas = canvasRef.current;

  try {
    // Make sure canvas dimensions match video dimensions
    if (canvas.width !== videoRef.current.videoWidth || canvas.height !== videoRef.current.videoHeight) {
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
    }

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

    // Enhanced pixel sampling with bounds checking
    const skipFactor = 8;
    const width = canvas.width;
    const height = canvas.height;

    for (let y = 0; y < height; y += skipFactor) {
      for (let x = 0; x < width; x += skipFactor) {
        const i = (y * width + x) * 4;
        if (i >= 0 && i < data.length - 3) {  // Ensure we don't go out of bounds
          const diff = Math.abs(data[i] - previousFrameRef.current[i]) +
                      Math.abs(data[i + 1] - previousFrameRef.current[i + 1]) +
                      Math.abs(data[i + 2] - previousFrameRef.current[i + 2]);

          if (diff > cameraConfig.minimumPixelDifference) {
            totalMotion += diff;
            motionPoints++;
          }
        }
      }
    }

    previousFrameRef.current = new Uint8ClampedArray(data);

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

const startFrameAnalysis = () => {
  if (analysisIntervalRef.current) {
    clearInterval(analysisIntervalRef.current);
  }

  // Run analysis more frequently for smoother updates
  analysisIntervalRef.current = setInterval(() => {
    if (systemState.isActive) {
      analyzeFrame();
    }
  }, 50);  // Reduced from 100ms to 50ms for more frequent updates
};

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

const calculateConfidence = (intensity, points) => {
  const intensityFactor = Math.min(intensity * 2, 1);
  const coverageFactor = Math.min(points / 1000, 1);
  return (intensityFactor * 0.6 + coverageFactor * 0.4);
};

const classifyMotion = (intensity, points) => {
  if (intensity > 0.7 && points > 500) return 'LARGE_ANIMAL';
  if (intensity > 0.4 && points > 200) return 'MEDIUM_ANIMAL';
  if (intensity > 0.2 && points > 50) return 'SMALL_ANIMAL';
  return 'AMBIENT_MOTION';
};

const handleDetection = (detection) => {
  if (detection.confidence > 0.4) {
    setDetectionData(prev => [...prev, {
      time: new Date(detection.timestamp).toLocaleTimeString(),
      intensity: detection.intensity,
      confidence: detection.confidence,
      type: detection.type
    }].slice(-50));

    updateAnalytics(detection);
  }
};

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

  // Camera Detection and Initialization Functions
const detectCameras = async () => {
  try {
    console.log('Starting camera detection...');
    await navigator.mediaDevices.getUserMedia({ video: true });
    
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices
      .filter(device => device.kind === 'videoinput')
      .map(device => ({
        id: device.deviceId,
        label: device.label || 'Unknown Camera',
        type: device.label.toLowerCase().includes('iphone') ? 'continuity' : 'built-in'
      }));
    
    setAvailableCameras(videoDevices);
  } catch (error) {
    console.error('Camera detection error:', error);
  }
};

const initializeCamera = async () => {
  try {
    await detectCameras();
    const selectedDevice = availableCameras.find(camera => camera.type === selectedCamera);

    const constraints = {
      video: selectedDevice ? {
        deviceId: { exact: selectedDevice.id },
        width: { ideal: selectedCamera === 'continuity' ? 3840 : 1920 },
        height: { ideal: selectedCamera === 'continuity' ? 2160 : 1080 },
        frameRate: { ideal: selectedCamera === 'continuity' ? 60 : 30 }
      } : true
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
    console.error('Camera initialization error:', error);
    // Fallback to any available camera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (fallbackError) {
      console.error('Fallback camera initialization failed:', fallbackError);
    }
  }
};

  // Functions
  const startRecording = async () => {
    if (!streamRef.current) return;
    
    recordedChunksRef.current = [];
    const mediaRecorder = new MediaRecorder(streamRef.current);
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    };
    
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      setRecordings(prev => [...prev, url]);
    };
    
    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start();
    setRecordingState('recording');
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recordingState === 'recording') {
      mediaRecorderRef.current.stop();
      setRecordingState('idle');
    }
  };

  const takeSnapshot = () => {
    if (!videoRef.current) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0);
    
    const imageUrl = canvas.toDataURL('image/png');
    setSnapshots(prev => [...prev, imageUrl]);
  };

  // Effects
  useEffect(() => {
    const interval = setInterval(() => {
      setSystemState(prev => ({
        ...prev,
        batteryLevel: Math.max(0, prev.batteryLevel - (prev.powerMode === 'ACTIVE' ? 0.1 : 0.01))
      }));
    }, 5000);

    return () => clearInterval(interval);
  }, []);
  // Initialize camera when system becomes active
  useEffect(() => {
    if (systemState.isActive) {
      initializeCamera();
    }
    return () => {
      cleanup();
    };
  }, [systemState.isActive, selectedCamera]);

  useEffect(() => {
    if (videoRef.current && videoRef.current.readyState >= 2) {
      const canvas = canvasRef.current;
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      analysisContextRef.current = canvas.getContext('2d', { willReadFrequently: true });
      startFrameAnalysis();
    }
  }, [videoRef.current?.readyState]);

// Detect cameras on mount
useEffect(() => {
  detectCameras();
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

        {/* Tab Navigation */}
        <div className="bg-white rounded-lg shadow-lg p-4 mb-4">
          <div className="flex space-x-4 border-b">
            {['live', 'analysis', 'gallery'].map((tab) => (
              <button
                key={tab}
                onClick={() => setSelectedTab(tab)}
                className={`pb-2 px-4 capitalize ${
                  selectedTab === tab
                    ? 'border-b-2 border-blue-500 text-blue-500'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {selectedTab === 'live' && (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {/* Camera Feed Column */}
    <div className="bg-white rounded-lg shadow-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800">Detection Zone</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedCamera('built-in')}
            className={`px-3 py-1 rounded-lg text-sm font-medium ${
              selectedCamera === 'built-in'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            MacBook Camera
          </button>
          <button
            onClick={() => setSelectedCamera('continuity')}
            className={`px-3 py-1 rounded-lg text-sm font-medium ${
              selectedCamera === 'continuity'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Continuity Camera
          </button>
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
        
        {/* Motion Detection Overlay */}
        {detectionData.length > 0 && detectionData[detectionData.length - 1].confidence > 0.6 && (
          <div className="absolute inset-0 border-4 border-red-500 animate-pulse" />
        )}
        
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-4">
          <button
            onClick={recordingState === 'idle' ? startRecording : stopRecording}
            className={`px-4 py-2 rounded-lg text-white flex items-center gap-2 ${
              recordingState === 'recording' 
                ? 'bg-red-500 hover:bg-red-600' 
                : 'bg-blue-500 hover:bg-blue-600'
            }`}
          >
            <Video className="w-4 h-4" />
            {recordingState === 'recording' ? 'Stop' : 'Record'}
          </button>
          
          <button
            onClick={takeSnapshot}
            className="px-4 py-2 rounded-lg text-white bg-blue-500 hover:bg-blue-600 flex items-center gap-2"
          >
            <Image className="w-4 h-4" />
            Snapshot
          </button>
        </div>
        
        {!streamRef.current && (
          <div className="absolute inset-0 flex items-center justify-center text-white">
            <p className="text-lg">Initializing Camera...</p>
          </div>
        )}
      </div>
    </div>

    {/* Live Analysis Column */}
    <div className="bg-white rounded-lg shadow-lg p-4">
      <h2 className="text-xl font-bold text-gray-800 mb-4">Live Analysis</h2>
      {detectionData.length > 0 ? (
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <h3 className="font-medium text-blue-800">Current Activity</h3>
            <p className="text-2xl font-bold text-blue-900">
              {detectionData[detectionData.length - 1].type.replace('_', ' ')}
            </p>
          </div>
          <div className="p-4 bg-green-50 rounded-lg">
            <h3 className="font-medium text-green-800">Confidence</h3>
            <p className="text-2xl font-bold text-green-900">
              {Math.round(detectionData[detectionData.length - 1].confidence * 100)}%
            </p>
          </div>
          <div className="p-4 bg-yellow-50 rounded-lg">
            <h3 className="font-medium text-yellow-800">Motion Intensity</h3>
            <p className="text-2xl font-bold text-yellow-900">
              {Math.round(detectionData[detectionData.length - 1].intensity * 100)}%
            </p>
          </div>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={detectionData.slice(-20)}>
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
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="text-center text-gray-500 py-8">
          Waiting for motion detection...
        </div>
      )}
    </div>
  </div>
)}

{selectedTab === 'analysis' && (
  <div className="grid grid-cols-1 gap-4">
    {/* Activity Graph */}
    <div className="bg-white rounded-lg shadow-lg p-4">
      <h2 className="text-xl font-bold text-gray-800 mb-4">Motion Activity</h2>
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

    {/* Stats Grid */}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-white rounded-lg shadow-lg p-4">
        <h3 className="text-lg font-semibold text-gray-800">Total Detections</h3>
        <p className="text-3xl font-bold text-blue-600">{analyticsData.totalDetections}</p>
      </div>
      
      {Object.entries(analyticsData.detectionsByType).map(([type, count]) => (
        <div key={type} className="bg-white rounded-lg shadow-lg p-4">
          <h3 className="text-lg font-semibold text-gray-800">{type.replace('_', ' ')}</h3>
          <p className="text-3xl font-bold text-green-600">{count}</p>
        </div>
      ))}
    </div>

    {/* Hourly Activity */}
    <div className="bg-white rounded-lg shadow-lg p-4">
      <h2 className="text-xl font-bold text-gray-800 mb-4">Hourly Activity</h2>
      <div className="grid grid-cols-12 gap-1">
        {analyticsData.hourlyActivity.map((count, hour) => (
          <div 
            key={hour}
            className="aspect-square rounded"
            style={{
              backgroundColor: `rgba(37, 99, 235, ${Math.min(count / 10, 1)})`,
            }}
            title={`${hour}:00 - ${count} detections`}
          />
        ))}
      </div>
    </div>
  </div>
)}

        {selectedTab === 'gallery' && (
          <div className="space-y-4">
            {recordings.length > 0 && (
              <div className="bg-white rounded-lg shadow-lg p-4">
                <h2 className="text-xl font-bold text-gray-800 mb-4">Recorded Sessions</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {recordings.map((url, index) => (
                    <div key={index} className="relative aspect-video">
                      <video
                        src={url}
                        controls
                        className="w-full h-full object-cover rounded-lg"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {snapshots.length > 0 && (
              <div className="bg-white rounded-lg shadow-lg p-4">
                <h2 className="text-xl font-bold text-gray-800 mb-4">Snapshots</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {snapshots.map((url, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={url}
                        alt={`Snapshot ${index + 1}`}
                        className="w-full h-auto rounded-lg"
                      />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <a
                          href={url}
                          download={`snapshot-${index + 1}.png`}
                          className="bg-black bg-opacity-50 p-2 rounded-full text-white hover:bg-opacity-75"
                        >
                          <svg 
                            className="w-6 h-6" 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path 
                              strokeLinecap="round" 
                              strokeLinejoin="round" 
                              strokeWidth={2} 
                              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                            />
                          </svg>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {recordings.length === 0 && snapshots.length === 0 && (
              <div className="bg-white rounded-lg shadow-lg p-8 text-center">
                <p className="text-gray-500">
                  No recordings or snapshots yet. Start by recording or taking snapshots in the live view.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default WildlifeDetectionInterface;
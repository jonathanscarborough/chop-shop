// IndexedDB utility for managing audio samples

const DB_NAME = 'ChopShopDB';
const DB_VERSION = 2;
const SAMPLES_STORE = 'samples';
const PROJECTS_STORE = 'projects';
const MASTER_RECORDINGS_STORE = 'masterRecordings';

export interface AudioSample {
  id: string;
  projectId: string;
  blob: Blob;
  timestamp: number;
  duration?: number;
  name?: string;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  lastModified: number;
}

export interface MasterRecording {
  id: string;
  projectId: string;
  blob: Blob;
  timestamp: number;
  duration: number;
}

let db: IDBDatabase | null = null;

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open database:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      console.log('Database opened successfully');
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create samples store
      if (!db.objectStoreNames.contains(SAMPLES_STORE)) {
        const samplesStore = db.createObjectStore(SAMPLES_STORE, { keyPath: 'id' });
        samplesStore.createIndex('projectId', 'projectId', { unique: false });
        samplesStore.createIndex('timestamp', 'timestamp', { unique: false });
        console.log('Created samples store');
      }

      // Create projects store
      if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
        const projectsStore = db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
        projectsStore.createIndex('createdAt', 'createdAt', { unique: false });
        console.log('Created projects store');
      }

      // Create master recordings store
      if (!db.objectStoreNames.contains(MASTER_RECORDINGS_STORE)) {
        const masterRecordingsStore = db.createObjectStore(MASTER_RECORDINGS_STORE, { keyPath: 'id' });
        masterRecordingsStore.createIndex('projectId', 'projectId', { unique: false });
        masterRecordingsStore.createIndex('timestamp', 'timestamp', { unique: false });
        console.log('Created master recordings store');
      }
    };
  });
};

export const saveSample = async (sample: AudioSample): Promise<void> => {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SAMPLES_STORE], 'readwrite');
    const store = transaction.objectStore(SAMPLES_STORE);
    const request = store.put(sample);

    request.onsuccess = () => {
      console.log('Sample saved:', sample.id);
      resolve();
    };

    request.onerror = () => {
      console.error('Failed to save sample:', request.error);
      reject(request.error);
    };
  });
};

export const getSamplesByProject = async (projectId: string): Promise<AudioSample[]> => {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SAMPLES_STORE], 'readonly');
    const store = transaction.objectStore(SAMPLES_STORE);
    const index = store.index('projectId');
    const request = index.getAll(projectId);

    request.onsuccess = () => {
      const samples = request.result;
      console.log(`Loaded ${samples.length} samples for project ${projectId}`);
      resolve(samples);
    };

    request.onerror = () => {
      console.error('Failed to load samples:', request.error);
      reject(request.error);
    };
  });
};

export const deleteSample = async (sampleId: string): Promise<void> => {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SAMPLES_STORE], 'readwrite');
    const store = transaction.objectStore(SAMPLES_STORE);
    const request = store.delete(sampleId);

    request.onsuccess = () => {
      console.log('Sample deleted:', sampleId);
      resolve();
    };

    request.onerror = () => {
      console.error('Failed to delete sample:', request.error);
      reject(request.error);
    };
  });
};

export const saveProject = async (project: Project): Promise<void> => {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([PROJECTS_STORE], 'readwrite');
    const store = transaction.objectStore(PROJECTS_STORE);
    const request = store.put(project);

    request.onsuccess = () => {
      console.log('Project saved:', project.id);
      resolve();
    };

    request.onerror = () => {
      console.error('Failed to save project:', request.error);
      reject(request.error);
    };
  });
};

export const getAllProjects = async (): Promise<Project[]> => {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([PROJECTS_STORE], 'readonly');
    const store = transaction.objectStore(PROJECTS_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      console.log('Loaded projects:', request.result.length);
      resolve(request.result);
    };

    request.onerror = () => {
      console.error('Failed to load projects:', request.error);
      reject(request.error);
    };
  });
};

export const getProject = async (projectId: string): Promise<Project | null> => {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([PROJECTS_STORE], 'readonly');
    const store = transaction.objectStore(PROJECTS_STORE);
    const request = store.get(projectId);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => {
      console.error('Failed to load project:', request.error);
      reject(request.error);
    };
  });
};

export const deleteProject = async (projectId: string): Promise<void> => {
  const database = await initDB();

  return new Promise(async (resolve, reject) => {
    try {
      // First delete all samples in the project
      const samples = await getSamplesByProject(projectId);
      for (const sample of samples) {
        await deleteSample(sample.id);
      }

      // Then delete the project
      const transaction = database.transaction([PROJECTS_STORE], 'readwrite');
      const store = transaction.objectStore(PROJECTS_STORE);
      const request = store.delete(projectId);

      request.onsuccess = () => {
        console.log('Project deleted:', projectId);
        resolve();
      };

      request.onerror = () => {
        console.error('Failed to delete project:', request.error);
        reject(request.error);
      };
    } catch (error) {
      reject(error);
    }
  });
};

export const saveMasterRecording = async (recording: MasterRecording): Promise<void> => {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([MASTER_RECORDINGS_STORE], 'readwrite');
    const store = transaction.objectStore(MASTER_RECORDINGS_STORE);
    const request = store.put(recording);

    request.onsuccess = () => {
      console.log('Master recording saved:', recording.id);
      resolve();
    };

    request.onerror = () => {
      console.error('Failed to save master recording:', request.error);
      reject(request.error);
    };
  });
};

export const getMasterRecordingByProject = async (projectId: string): Promise<MasterRecording | null> => {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([MASTER_RECORDINGS_STORE], 'readonly');
    const store = transaction.objectStore(MASTER_RECORDINGS_STORE);
    const index = store.index('projectId');
    const request = index.getAll(projectId);

    request.onsuccess = () => {
      const recordings = request.result;
      if (recordings.length === 0) {
        resolve(null);
      } else {
        // Return the most recent recording
        recordings.sort((a, b) => b.timestamp - a.timestamp);
        resolve(recordings[0]);
      }
    };

    request.onerror = () => {
      console.error('Failed to load master recording:', request.error);
      reject(request.error);
    };
  });
};

export const deleteMasterRecording = async (recordingId: string): Promise<void> => {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([MASTER_RECORDINGS_STORE], 'readwrite');
    const store = transaction.objectStore(MASTER_RECORDINGS_STORE);
    const request = store.delete(recordingId);

    request.onsuccess = () => {
      console.log('Master recording deleted:', recordingId);
      resolve();
    };

    request.onerror = () => {
      console.error('Failed to delete master recording:', request.error);
      reject(request.error);
    };
  });
};

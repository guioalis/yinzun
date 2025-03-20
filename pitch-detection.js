/**
 * 音高检测模块
 * 使用自相关法(ACF)和FFT进行音高检测
 */
class PitchDetector {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.isRecording = false;
        this.audioData = null;
        this.bufferSize = 4096;
        this.noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        this.callbacks = {
            onNoteDetected: null,
            onWaveformData: null,
            onError: null
        };
    }

    /**
     * 初始化音频上下文和分析器
     */
    async init() {
        try {
            // 创建音频上下文
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = this.bufferSize;
            this.audioData = new Float32Array(this.analyser.fftSize);
            
            // 设置分析器参数
            this.analyser.smoothingTimeConstant = 0.8;
            
            return true;
        } catch (error) {
            if (this.callbacks.onError) {
                this.callbacks.onError("无法初始化音频系统: " + error.message);
            }
            return false;
        }
    }

    /**
     * 开始录音并分析音高
     */
    async start() {
        if (this.isRecording) return;
        
        try {
            // 请求麦克风权限
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // 连接麦克风到分析器
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.microphone.connect(this.analyser);
            
            this.isRecording = true;
            
            // 开始分析循环
            this._analyzeAudio();
            
            return true;
        } catch (error) {
            if (this.callbacks.onError) {
                this.callbacks.onError("无法访问麦克风: " + error.message);
            }
            return false;
        }
    }

    /**
     * 停止录音和分析
     */
    stop() {
        if (!this.isRecording) return;
        
        // 断开麦克风连接
        if (this.microphone) {
            this.microphone.disconnect();
            this.microphone = null;
        }
        
        this.isRecording = false;
    }

    /**
     * 设置回调函数
     */
    setCallbacks(callbacks) {
        this.callbacks = { ...this.callbacks, ...callbacks };
    }

    /**
     * 分析音频数据循环
     */
    _analyzeAudio() {
        if (!this.isRecording) return;
        
        // 获取时域数据用于波形显示
        const waveformData = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteTimeDomainData(waveformData);
        
        if (this.callbacks.onWaveformData) {
            this.callbacks.onWaveformData(waveformData);
        }
        
        // 获取音频数据用于音高检测
        this.analyser.getFloatTimeDomainData(this.audioData);
        
        // 检测是否有声音（避免静音时的错误检测）
        const volume = this._calculateVolume(this.audioData);
        
        if (volume > 0.01) { // 音量阈值
            // 使用自相关法检测音高
            const frequency = this._autoCorrelation(this.audioData, this.audioContext.sampleRate);
            
            if (frequency > 0) {
                // 将频率转换为音符
                const note = this._frequencyToNote(frequency);
                
                if (this.callbacks.onNoteDetected) {
                    this.callbacks.onNoteDetected({
                        frequency,
                        note: note.note,
                        noteIndex: note.noteIndex,
                        octave: note.octave,
                        cents: note.cents
                    });
                }
            }
        }
        
        // 继续分析循环
        requestAnimationFrame(() => this._analyzeAudio());
    }

    /**
     * 计算音频数据的音量
     */
    _calculateVolume(buffer) {
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
            sum += buffer[i] * buffer[i];
        }
        return Math.sqrt(sum / buffer.length);
    }

    /**
     * 使用自相关法检测音高
     */
    _autoCorrelation(buffer, sampleRate) {
        // 复制缓冲区以避免修改原始数据
        const bufferCopy = new Float32Array(buffer);
        
        // 应用窗口函数减少边缘效应
        for (let i = 0; i < bufferCopy.length; i++) {
            bufferCopy[i] *= 0.5 * (1 - Math.cos(2 * Math.PI * i / bufferCopy.length));
        }
        
        // 自相关计算
        const correlations = new Array(bufferCopy.length).fill(0);
        
        for (let lag = 0; lag < correlations.length; lag++) {
            for (let i = 0; i < correlations.length - lag; i++) {
                correlations[lag] += bufferCopy[i] * bufferCopy[i + lag];
            }
        }
        
        // 查找自相关峰值（跳过前几个样本以避免直流偏移）
        let maxCorrelation = -1;
        let maxLag = -1;
        const minLag = Math.floor(sampleRate / 1500); // 约1500Hz的最高频率
        
        for (let lag = minLag; lag < correlations.length / 2; lag++) {
            if (correlations[lag] > maxCorrelation) {
                maxCorrelation = correlations[lag];
                maxLag = lag;
            }
        }
        
        // 如果找到有效峰值，计算频率
        if (maxLag > 0) {
            // 使用抛物线插值提高精度
            const y1 = correlations[maxLag - 1];
            const y2 = correlations[maxLag];
            const y3 = correlations[maxLag + 1];
            
            const a = (y1 + y3 - 2 * y2) / 2;
            const b = (y3 - y1) / 2;
            
            const refinedLag = a ? maxLag - b / (2 * a) : maxLag;
            
            return sampleRate / refinedLag;
        }
        
        return -1; // 未检测到音高
    }

    /**
     * 将频率转换为音符信息
     */
    _frequencyToNote(frequency) {
        // A4 = 440Hz, 12音阶平均律
        const A4 = 440;
        const A4Index = 69; // MIDI音符编号
        
        // 计算与A4的半音差
        const semitoneOffset = 12 * Math.log2(frequency / A4);
        
        // 计算MIDI音符编号
        const midiNote = Math.round(A4Index + semitoneOffset);
        
        // 计算音符和八度
        const noteIndex = midiNote % 12;
        const octave = Math.floor(midiNote / 12) - 1;
        
        // 计算音分偏差（cents）
        const exactSemitones = A4Index + semitoneOffset;
        const cents = Math.round((exactSemitones - midiNote) * 100);
        
        return {
            note: this.noteStrings[noteIndex],
            noteIndex,
            octave,
            cents
        };
    }

    /**
     * 获取参考音符的频率
     */
    getReferenceFrequency(noteIndex, octave = 4) {
        // A4 = 440Hz
        const A4 = 440;
        const A4Index = 69; // MIDI音符编号
        
        // 计算目标音符的MIDI编号
        const midiNote = (octave + 1) * 12 + noteIndex;
        
        // 计算与A4的半音差
        const semitoneOffset = midiNote - A4Index;
        
        // 使用平均律计算频率
        return A4 * Math.pow(2, semitoneOffset / 12);
    }
}
/**
 * 音频分析器模块
 * 用于分析上传的歌曲音频并提取音高信息
 */
class AudioAnalyzer {
    constructor(audioContext) {
        this.audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
        this.bufferSize = 4096;
        this.noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    }

    /**
     * 从URL加载音频文件
     */
    async loadAudioFromUrl(url) {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            return audioBuffer;
        } catch (error) {
            throw new Error('加载音频文件失败: ' + error.message);
        }
    }

    /**
     * 分析音频数据提取音高信息
     */
    async analyzeAudio(audioBuffer) {
        const noteData = [];
        const channelData = audioBuffer.getChannelData(0); // 使用第一个声道
        const sampleRate = audioBuffer.sampleRate;
        
        // 分段分析音频数据
        const segmentDuration = 0.05; // 50毫秒
        const samplesPerSegment = Math.floor(segmentDuration * sampleRate);
        const totalSegments = Math.floor(channelData.length / samplesPerSegment);
        
        // 设置最小音量阈值，低于此值的视为静音
        const volumeThreshold = 0.01;
        
        let currentNote = null;
        let noteStartTime = 0;
        let consecutiveSilentSegments = 0;
        
        for (let i = 0; i < totalSegments; i++) {
            const segmentStart = i * samplesPerSegment;
            const segment = channelData.slice(segmentStart, segmentStart + samplesPerSegment);
            
            // 计算音量
            const volume = this._calculateVolume(segment);
            
            // 如果音量低于阈值，视为静音
            if (volume < volumeThreshold) {
                consecutiveSilentSegments++;
                
                // 如果连续多个片段都是静音，且之前有检测到音符，则记录该音符
                if (consecutiveSilentSegments >= 3 && currentNote) {
                    const noteDuration = (i * segmentDuration) - noteStartTime;
                    
                    // 只记录持续时间足够长的音符
                    if (noteDuration >= 0.1) {
                        noteData.push({
                            ...currentNote,
                            startTime: noteStartTime,
                            duration: noteDuration
                        });
                    }
                    
                    currentNote = null;
                }
            } else {
                // 重置静音计数
                consecutiveSilentSegments = 0;
                
                // 检测音高
                const frequency = this._detectPitch(segment, sampleRate);
                
                if (frequency > 0) {
                    const note = this._frequencyToNote(frequency);
                    
                    // 如果是新音符或与当前音符不同，则记录新音符
                    if (!currentNote || Math.abs(currentNote.frequency - frequency) > 5) {
                        // 如果之前有音符，先记录它
                        if (currentNote) {
                            const noteDuration = (i * segmentDuration) - noteStartTime;
                            if (noteDuration >= 0.1) {
                                noteData.push({
                                    ...currentNote,
                                    startTime: noteStartTime,
                                    duration: noteDuration
                                });
                            }
                        }
                        
                        // 记录新音符
                        currentNote = {
                            frequency,
                            note: note.note,
                            noteIndex: note.noteIndex,
                            octave: note.octave,
                            cents: note.cents
                        };
                        noteStartTime = i * segmentDuration;
                    }
                }
            }
        }
        
        // 处理最后一个音符
        if (currentNote) {
            const noteDuration = (totalSegments * segmentDuration) - noteStartTime;
            if (noteDuration >= 0.1) {
                noteData.push({
                    ...currentNote,
                    startTime: noteStartTime,
                    duration: noteDuration
                });
            }
        }
        
        return noteData;
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
    _detectPitch(buffer, sampleRate) {
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
}
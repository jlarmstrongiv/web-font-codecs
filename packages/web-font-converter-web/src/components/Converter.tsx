import { useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Card, Col, Collapse, ConfigProvider, Divider, InputNumber, Radio, Row, Slider, Space, Statistic, Switch, Tag, Typography, Upload, theme } from 'antd';
import { DownloadOutlined, FileTextOutlined, InboxOutlined, LoadingOutlined, SwapOutlined } from '@ant-design/icons';
import prettyBytes from 'pretty-bytes';
import prettyMs from 'pretty-ms';
import type { FontFormat } from 'web-font-codecs';
import type { Reply, Request } from '../worker.ts';
import { FORMAT_LABELS, MIME_TYPES, inspectFile, outputName } from '../lib/files.ts';
import type { SelectedFont } from '../lib/files.ts';
import { FeatureGrid } from './FeatureGrid.tsx';
import packageInfo from '../../../web-font-codecs/package.json';
import './converter.css';

const { Title, Paragraph, Text } = Typography;
interface DownloadResult { url: string; name: string; size: number; inputSize: number; from: FontFormat; to: FontFormat; elapsed: number; warnings: string[] }
const sampleBase = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/samples/`;
const SAMPLES = [
  { file: 'Rochester.otf', label: 'Rochester · OTF' },
  { file: 'OpenSans-Regular.ttf', label: 'Open Sans · TTF' },
  { file: 'OpenSans-Regular.woff', label: 'Open Sans · WOFF' },
  { file: 'OpenSans-Regular.woff2', label: 'Open Sans · WOFF2' },
];
const THEME = { algorithm: theme.defaultAlgorithm, token: { colorTextDescription: 'rgba(0, 0, 0, 0.70)' } };
export default function Converter() {
  return <ConfigProvider theme={THEME}><App><ConverterBody /></App></ConfigProvider>;
}
function ConverterBody() {
  const { token } = theme.useToken();
  const [font, setFont] = useState<SelectedFont>();
  const [to, setTo] = useState<FontFormat>('woff2');
  const [compression, setCompression] = useState<'zlib' | 'zopfli'>('zlib');
  const [iterations, setIterations] = useState(15);
  const [quality, setQuality] = useState(11);
  const [transforms, setTransforms] = useState(true);
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState('');
  const [cancelled, setCancelled] = useState(false);
  const [retry, setRetry] = useState(0);
  const [sample, setSample] = useState('');
  const [output, setOutput] = useState<DownloadResult>();
  const worker = useRef<Worker | null>(null);
  const download = useRef<string | null>(null);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sourceRequest = useRef<AbortController | undefined>(undefined);
  function invalidate() {
    generation.current++;
    worker.current?.terminate(); worker.current = null;
    clearTimeout(timer.current); timer.current = undefined;
    sourceRequest.current?.abort(); sourceRequest.current = undefined;
    return generation.current;
  }
  useEffect(() => () => { invalidate(); if (download.current) URL.revokeObjectURL(download.current); }, []);
  function clearOutput() {
    setOutput(undefined);
    if (download.current) { URL.revokeObjectURL(download.current); download.current = null; }
  }
  async function choose(source: File | ((signal: AbortSignal) => Promise<File>), sampleName = '') {
    const id = invalidate();
    clearOutput(); setFont(undefined); setError(''); setCancelled(false); setChoosing(true); setBusy(false); setSample(sampleName);
    const controller = new AbortController(); sourceRequest.current = controller;
    try {
      const file = typeof source === 'function' ? await source(controller.signal) : source;
      if (id !== generation.current) return;
      const selected = await inspectFile(file);
      if (id === generation.current) setFont(selected);
    } catch (error) { if (id === generation.current) setError(error instanceof Error ? error.message : String(error)); }
    finally { if (id === generation.current) setChoosing(false); }
  }
  function chooseSample(name: string) {
    void choose(async signal => {
      const response = await fetch(sampleBase + name, { signal });
      if (!response.ok) throw new Error('Could not load the sample font. Please try again.');
      return new File([await response.blob()], name, { type: name.endsWith('.otf') ? 'font/otf' : name.endsWith('.woff2') ? 'font/woff2' : name.endsWith('.woff') ? 'font/woff' : 'font/ttf' });
    }, name);
  }
  function cancel() {
    invalidate(); setBusy(false); setChoosing(false); setCancelled(true);
  }
  // Input and settings changes invalidate old work immediately; debounce the
  // next run so dragging the quality slider doesn't start a worker per tick.
  useEffect(() => {
    if (!font) return;
    const id = invalidate();
    clearOutput(); setBusy(true); setError(''); setCancelled(false);
    timer.current = setTimeout(() => { void convert(font, id); }, 250);
    return () => { if (id === generation.current) invalidate(); };
  }, [font, to, quality, transforms, compression, iterations, retry]);
  async function convert(selected: SelectedFont, id: number) {
    if (id !== generation.current) return;
    const started = performance.now();
    let current: Worker | undefined;
    const stop = () => { current?.terminate(); if (worker.current === current) worker.current = null; };
    try {
      current = new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' });
      worker.current = current;
      current.onmessage = ({ data }: MessageEvent<Reply>) => {
        if (id !== generation.current) return;
        setBusy(false); stop();
        if (!data.ok) {
          const hints = data.code === 'CODEC_FAILURE' || data.code === 'INVALID_INPUT' ? ' The font may be damaged or contain unsupported data.' : data.code === 'WASM_INIT' ? ' Reload the page to retry loading the converter.' : '';
          setError(data.error + hints); return;
        }
        const url = URL.createObjectURL(new Blob([data.result.data], { type: MIME_TYPES[data.result.extension] }));
        download.current = url;
        setOutput({ url, name: outputName(selected.file.name, data.result.extension), size: data.result.data.length, inputSize: selected.file.size, from: data.result.from, to: data.result.to, elapsed: performance.now() - started,
          warnings: [data.result.discardedAuxiliaryData ? 'The source font’s container metadata or private data was not carried into the converted file.' : '', ...data.result.warnings.map(warning => `The codec repaired font data: ${warning}.`)].filter(Boolean) });
      };
      current.onerror = () => { if (id === generation.current) { setBusy(false); setError('Conversion stopped unexpectedly. Try again or choose a smaller font.'); } stop(); };
      const bytes = await selected.file.arrayBuffer();
      if (id !== generation.current) return;
      current.postMessage({ bytes, options: to === 'woff2' ? { to, encode: { quality, allowTransforms: transforms } } : to === 'woff1' ? { to, encode: compression === 'zopfli' ? { compression, iterations } : { compression } } : { to } } satisfies Request, [bytes]);
    } catch (error) {
      stop();
      if (id === generation.current) { setBusy(false); setError(error instanceof Error ? error.message : String(error)); }
    }
  }
  function optionsChanged() { if (font) invalidate(); clearOutput(); setCancelled(false); setError(''); }
  function selectOutput(value: FontFormat) { if (value !== to) { optionsChanged(); setTo(value); } }
  const sizeDifference = output ? 100 * (1 - output.size / output.inputSize) : 0;
  return <main className="converter-shell">
    <header className="converter-header">
      <Space align="baseline" wrap><Title level={1} style={{ margin: 0 }}>web-font-codecs</Title><Text type="secondary">{packageInfo.version}</Text></Space>
      <Paragraph type="secondary" style={{ fontSize: 16, marginTop: 12 }}>Convert TTF/OTF, WOFF and WOFF2 fonts in your browser. Results update automatically when you choose a font or change the options.</Paragraph>
    </header>
    <FeatureGrid />
    <Card className="converter-panel" aria-label="Font converter">
      <Row gutter={[8,8]} aria-label="Sample fonts" style={{ marginBottom: 16 }}>
        {SAMPLES.map(item => <Col key={item.file} xs={24} sm={12} lg={6}><Button block icon={<FileTextOutlined aria-hidden="true" />} aria-pressed={sample === item.file} onClick={() => chooseSample(item.file)}>Try {item.label}</Button></Col>)}
      </Row>
          <label htmlFor="font-file" className="visually-hidden">Font file</label>
          <Upload.Dragger id="font-file" accept=".ttf,.otf,.woff,.woff2" multiple={false} showUploadList={false}
            beforeUpload={file => { void choose(file); return Upload.LIST_IGNORE; }}>
            <div className="drop-content">
              {busy || choosing ? <LoadingOutlined aria-hidden="true" style={{ color: token.colorPrimary, fontSize: 38 }} /> : font ? <FileTextOutlined aria-hidden="true" style={{ color: token.colorPrimary, fontSize: 38 }} /> : <InboxOutlined aria-hidden="true" style={{ color: token.colorPrimary, fontSize: 38 }} />}
              <Text strong className="font-name">{choosing ? 'Loading font…' : font ? font.file.name : 'Drop a font here or click to browse'}</Text>
              {font ? <Space wrap><Tag>{font.format === 'sfnt' ? font.sfntExtension.toUpperCase() : FORMAT_LABELS[font.format]}</Tag><Text type="secondary">{prettyBytes(font.file.size)}</Text></Space> : <Text type="secondary">TTF, OTF, WOFF or WOFF2 · up to 512 MiB</Text>}
              <div role="status"><Text style={{ color: token.colorPrimary }}>{choosing ? 'Reading font…' : busy ? 'Converting…' : output ? 'Ready to download' : cancelled ? 'Cancelled' : error ? 'Choose another font or try again' : 'Converts automatically'}</Text></div>
            </div>
          </Upload.Dragger>
          <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 20 }}>Choose an individual font up to 512 MiB. <Typography.Link href={sampleBase + 'NOTICE.txt'} target="_blank" rel="noreferrer">Sample font credits</Typography.Link></Paragraph>
          <Text strong id="output-label" style={{ display: 'block', marginBottom: 8 }}>Output format</Text>
          <Radio.Group aria-label="Output format" value={to} onChange={event => selectOutput(event.target.value as FontFormat)}
            optionType="button" buttonStyle="solid" block options={[{ label: 'WOFF2', value: 'woff2' }, { label: 'WOFF', value: 'woff1' }, { label: 'TTF / OTF', value: 'sfnt' }]} />
          <Paragraph type="secondary" className="format-description">{to === 'woff2' ? 'Compact compression for modern web fonts.' : to === 'woff1' ? 'The original WOFF format for broader compatibility.' : font ? `This font will download as .${font.sfntExtension}. Its original outline format is preserved.` : 'Downloads as .ttf or .otf to match the font’s original outline format.'}</Paragraph>
          {to === 'woff1' && <Collapse ghost className="advanced-options-collapse" style={{ marginTop: 8 }} items={[{ key: 'compression', label: 'Compression options', children: <Space orientation="vertical" style={{ width: '100%' }} size="large">
            <div><Text strong>Compression engine</Text><div><Radio.Group aria-label="WOFF compression engine" value={compression} onChange={event => { optionsChanged(); setCompression(event.target.value); }} options={[{ label: 'zlib · faster', value: 'zlib' }, { label: 'Zopfli · smaller', value: 'zopfli' }]} /></div><Text type="secondary">Zopfli takes longer to find a smaller file. Both produce standard WOFF files.</Text></div>
            {compression === 'zopfli' && <div><label htmlFor="iterations-input"><Text strong>Zopfli iterations</Text></label><div><InputNumber id="iterations-input" aria-label="Zopfli iterations" min={1} max={100} precision={0} value={iterations} onChange={value => { if (value !== null && value !== iterations) { optionsChanged(); setIterations(value); } }} /></div><Text type="secondary">More iterations take longer. Default: 15.</Text></div>}
          </Space> }]} />}
          {to === 'woff2' && <Collapse ghost className="advanced-options-collapse" style={{ marginTop: 8 }} items={[{ key: 'compression', label: 'Compression options', children: <Space orientation="vertical" style={{ width: '100%' }} size="large">
            <div style={{ width: '100%' }}><label htmlFor="quality-input"><Text strong>Compression quality</Text></label><Row gutter={16} align="middle"><Col flex="auto"><Slider aria-label="Compression quality slider" min={0} max={11} value={quality} onChange={value => { if (value !== quality) { optionsChanged(); setQuality(value); } }} /></Col><Col><InputNumber id="quality-input" aria-label="Compression quality" min={0} max={11} precision={0} value={quality} onChange={value => { if (value !== null && value !== quality) { optionsChanged(); setQuality(value); } }} /></Col></Row><Text type="secondary">Higher values make smaller files but take longer. Default: 11.</Text></div>
            <Space><Switch aria-label="Optimize glyph storage" checked={transforms} onChange={value => { optionsChanged(); setTransforms(value); }} /><Text>Optimize glyph storage</Text></Space>
          </Space> }]} />}
      {(busy || choosing) && <Button onClick={cancel} style={{ marginTop: 16 }}>Cancel conversion</Button>}
    <div aria-live="polite" className="converter-feedback">
      {error && <Alert type="error" showIcon title="Could not convert this font" description={error} />}
      {cancelled && <Alert type="info" showIcon title="Conversion cancelled" description="Choose a font or change an option to start again." action={font ? <Button onClick={() => setRetry(value => value + 1)}>Retry conversion</Button> : undefined} />}
      {output && <section aria-label="Converted font"><Divider />
        <div className="result-heading"><div><Title level={4} className="font-name" style={{ margin: '0 0 8px' }}>{output.name}</Title><Space><Tag>{FORMAT_LABELS[output.from]}</Tag><SwapOutlined aria-hidden="true" /><Tag color="blue">{FORMAT_LABELS[output.to]}</Tag><Text type="secondary">{prettyMs(output.elapsed)}</Text></Space></div>
          <Button type="primary" size="large" icon={<DownloadOutlined aria-hidden="true" />} href={output.url} download={output.name}>Download {output.name}</Button></div>
        <Divider />
        <Row gutter={[24,16]}><Col xs={12} sm={8}><Statistic title="Original size" value={prettyBytes(output.inputSize)} /></Col><Col xs={12} sm={8}><Statistic title="Converted size" value={prettyBytes(output.size)} /></Col><Col xs={24} sm={8}><Statistic title={sizeDifference >= 0 ? 'Smaller by' : 'Larger by'} value={Math.abs(sizeDifference)} precision={1} suffix="%" /></Col></Row>
        {output.warnings.map(warning => <Alert key={warning} type="warning" showIcon title={warning} style={{ marginTop: 16 }} />)}
      </section>}
    </div>
    </Card>
    <footer><Text type="secondary">Conversion changes the font’s container and compression. It preserves the original outlines and never uploads your files.</Text></footer>
  </main>;
}

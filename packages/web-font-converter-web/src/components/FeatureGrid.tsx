import { Card, Col, Row, Space, Typography } from 'antd';
import { DownloadOutlined, FileProtectOutlined, LockOutlined, SafetyCertificateOutlined, SlidersOutlined, SwapOutlined } from '@ant-design/icons';
const features = [
  { Icon: LockOutlined, text: 'Private by default. Your fonts never leave your browser.' },
  { Icon: SwapOutlined, text: 'Convert between TTF/OTF, WOFF and WOFF2.' },
  { Icon: FileProtectOutlined, text: 'Preserve the font’s original outlines.' },
  { Icon: SafetyCertificateOutlined, text: 'Powered by Mozilla and Google’s font codecs.' },
  { Icon: SlidersOutlined, text: 'Fine-tune WOFF2 compression for speed or size.' },
  { Icon: DownloadOutlined, text: 'Automatic conversion. Download as soon as it’s ready.' },
];
export function FeatureGrid() {
  return <section aria-label="Converter features"><Row gutter={[16,16]} style={{ marginBottom: 16 }}>
    {features.map(({ Icon, text }) => <Col key={text} xs={24} sm={12} lg={8}>
      <Card size="small" style={{ height: '100%' }}><Space align="start"><Icon aria-hidden="true" style={{ fontSize: 20 }} /><Typography.Text>{text}</Typography.Text></Space></Card>
    </Col>)}
  </Row></section>;
}

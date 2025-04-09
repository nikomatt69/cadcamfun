// pages/opensearch.xml.tsx
import { GetServerSideProps } from 'next';

const OpenSearch = () => {
  // This component doesn't render anything
  return null;
};

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const baseUrl = process.env.NEXTAUTH_URL || 'https://localhost:3000';
  
  const openSearchXML = `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/" xmlns:moz="http://www.mozilla.org/2006/browser/search/">
  <ShortName>CAD/CAM FUN</ShortName>
  <Description>Search CAD/CAM FUN for projects, components, and designs</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <Image width="16" height="16" type="image/x-icon">${baseUrl}/favicon.ico</Image>
  <Url type="text/html" template="${baseUrl}/search?q={searchTerms}"/>
  <moz:SearchForm>${baseUrl}/search</moz:SearchForm>
  <SearchForm>${baseUrl}/search</SearchForm>
</OpenSearchDescription>`;

  res.setHeader('Content-Type', 'application/xml');
  res.write(openSearchXML);
  res.end();

  return {
    props: {},
  };
};

export default OpenSearch;

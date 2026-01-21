import React from 'react';
import { Button as OldButton } from '../../components/component-library';
import { Button, Text } from '@metamask/design-system-react';

export const MixedPage = () => {
  return (
    <div>
      <OldButton>Old Button</OldButton>
      <Button>New Button</Button>
      <Text>Some text</Text>
    </div>
  );
};

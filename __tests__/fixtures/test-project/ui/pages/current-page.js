import React from 'react';
import { Button, Icon, Text, Box } from '@metamask/design-system-react';

export const CurrentPage = () => {
  return (
    <Box>
      <Button>New Button</Button>
      <Icon name="check" />
      <Text>Welcome</Text>
      <Button variant="primary">Submit</Button>
    </Box>
  );
};
